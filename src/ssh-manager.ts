import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { access, chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import type { OperationResult, RemoteConnection, RemoteSessionState, RemoteSessionView } from './protocol.ts'
import type { ConnectionStore } from './store.ts'

const COMMAND_TIMEOUT_MS = 30_000
const BOOT_TIMEOUT_MS = 45_000
const LOG_LIMIT = 48 * 1024
interface ProcessResult extends OperationResult { exitCode: number | null }
interface AskpassFiles { env: NodeJS.ProcessEnv; dispose(): Promise<void> }
interface RemoteSession { connection: RemoteConnection; process: ChildProcessWithoutNullStreams; localPort: number; remotePort: number; remotePath: string; markerPath: string; token: string; state: RemoteSessionState; startedAt: string; error?: string; logTail: string; askpass?: AskpassFiles }
export interface ConnectOptions { password?: string; remotePath?: string }
export interface BootstrapOptions { password?: string; installUi?: boolean }

export function shellQuote(value: string): string { return `'${value.replace(/'/g, `'\\''`)}'` }
function appendTail(current: string, chunk: Buffer | string): string { const combined = current + chunk.toString(); return combined.length > LOG_LIMIT ? combined.slice(-LOG_LIMIT) : combined }
async function executableOrFallback(candidates: string[]): Promise<string> { for (const candidate of candidates) { if (!candidate.includes('\\') && !candidate.includes('/')) return candidate; try { await access(candidate); return candidate } catch {} } return candidates.at(-1) ?? '' }
async function freePort(): Promise<number> { return await new Promise((resolve, reject) => { const server = createServer(); server.once('error', reject); server.listen(0, '127.0.0.1', () => { const address = server.address(); if (address === null || typeof address === 'string') return reject(new Error('failed to allocate port')); const port = address.port; server.close(error => error ? reject(error) : resolve(port)) }) }) }
async function makeAskpass(password: string): Promise<AskpassFiles> {
  if (password === '') throw new Error('password is required')
  const directory = await mkdtemp(join(tmpdir(), 'dsh-remote-ssh-')); const passwordFile = join(directory, 'password.txt'); const windows = process.platform === 'win32'; const script = join(directory, windows ? 'askpass.cmd' : 'askpass.sh')
  await writeFile(passwordFile, password, { encoding: 'utf8', mode: 0o600 }); await writeFile(script, windows ? `@echo off\r\n@type "${passwordFile}"\r\n` : `#!/bin/sh\ncat ${shellQuote(passwordFile)}\n`, { encoding: 'utf8', mode: 0o700 }); if (!windows) await chmod(script, 0o700)
  return { env: { ...process.env, SSH_ASKPASS: script, SSH_ASKPASS_REQUIRE: 'force', DISPLAY: process.env.DISPLAY || ':0' }, dispose: () => rm(directory, { recursive: true, force: true }) }
}
function targetOf(c: RemoteConnection): string { return c.authType === 'config' || c.user === '' ? c.host : `${c.user}@${c.host}` }
export function sshConnectionArgs(c: RemoteConnection, password = false): string[] { const args = ['-o', 'ConnectTimeout=12', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=3', '-o', 'StrictHostKeyChecking=accept-new', '-o', 'RequestTTY=no']; if (!password) args.push('-o', 'BatchMode=yes'); if (c.authType !== 'config' && c.port !== 22) args.push('-p', String(c.port)); if (c.authType === 'key') args.push('-i', c.keyPath); args.push(targetOf(c)); return args }
function scpConnectionArgs(c: RemoteConnection, password = false): string[] { const args = ['-o', 'ConnectTimeout=12', '-o', 'StrictHostKeyChecking=accept-new']; if (!password) args.push('-o', 'BatchMode=yes'); if (c.authType !== 'config' && c.port !== 22) args.push('-P', String(c.port)); if (c.authType === 'key') args.push('-i', c.keyPath); return args }
function runProcess(executable: string, args: string[], options: { env?: NodeJS.ProcessEnv; timeoutMs?: number } = {}): Promise<ProcessResult> {
  return new Promise(resolve => { const started = Date.now(); let stdout = ''; let stderr = ''; let settled = false; const child = spawn(executable, args, { env: options.env ?? process.env, windowsHide: true }); const finish = (value: ProcessResult) => { if (settled) return; settled = true; clearTimeout(timer); resolve(value) }; child.stdout.on('data', c => { stdout = appendTail(stdout, c) }); child.stderr.on('data', c => { stderr = appendTail(stderr, c) }); child.once('error', error => finish({ ok: false, exitCode: null, stdout, stderr, error: error.message, elapsedMs: Date.now() - started })); child.once('close', exitCode => finish({ ok: exitCode === 0, exitCode, stdout, stderr, error: exitCode === 0 ? undefined : (stderr || stdout || `process exited with ${exitCode}`).trim(), elapsedMs: Date.now() - started })); const timer = setTimeout(() => { child.kill('SIGTERM'); finish({ ok: false, exitCode: null, stdout, stderr, error: `operation timed out after ${options.timeoutMs ?? COMMAND_TIMEOUT_MS} ms`, elapsedMs: Date.now() - started }) }, options.timeoutMs ?? COMMAND_TIMEOUT_MS) })
}

export class RemoteSshManager {
  readonly packageVersion = '0.4.0'; readonly sshPath: string; readonly scpPath: string; private readonly sessions = new Map<string, RemoteSession>()
  private constructor(private readonly store: ConnectionStore, private readonly packageRoot: string, sshPath: string, scpPath: string) { this.sshPath = sshPath; this.scpPath = scpPath }
  static async create(store: ConnectionStore, packageRoot: string): Promise<RemoteSshManager> { const windows = process.platform === 'win32'; return new RemoteSshManager(store, packageRoot, await executableOrFallback(windows ? ['C:\\Windows\\System32\\OpenSSH\\ssh.exe', 'ssh'] : ['/usr/bin/ssh', 'ssh']), await executableOrFallback(windows ? ['C:\\Windows\\System32\\OpenSSH\\scp.exe', 'scp'] : ['/usr/bin/scp', 'scp'])) }
  listSessions(): RemoteSessionView[] { return [...this.sessions.values()].map(s => this.view(s)) }
  sessionForMarker(cwd: string): { connection: RemoteConnection; markerPath: string; remotePath: string } | undefined { const s = [...this.sessions.values()].find(v => v.state === 'ready' && (cwd === v.markerPath || cwd.startsWith(`${v.markerPath}\\`) || cwd.startsWith(`${v.markerPath}/`))); return s ? { connection: s.connection, markerPath: s.markerPath, remotePath: s.remotePath } : undefined }
  async rpc<T>(connectionId: string, op: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<T> { const s = this.sessions.get(connectionId); if (!s || s.state !== 'ready') throw new Error(`Remote-SSH connection is not ready: ${connectionId}`); const response = await fetch(`http://127.0.0.1:${s.localPort}/rpc`, { method: 'POST', headers: { authorization: `Bearer ${s.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ op, args }), signal }); const body = await response.json() as { ok?: boolean; value?: T; error?: { message?: string; code?: string } }; if (!response.ok || body.ok !== true) { const error = new Error(body.error?.message ?? `remote RPC failed: HTTP ${response.status}`) as Error & { code?: string }; error.code = body.error?.code; throw error } return body.value as T }
  async test(connectionId: string, password = ''): Promise<OperationResult> { const c = this.store.get(connectionId); return this.execRemote(c, `set -eu; cd -- ${shellQuote(c.remotePath)}; printf "DSH_REMOTE_PATH=%s\\n" "$(pwd -P)"; ${shellQuote(c.runtimeCommand)} --version`, password) }
  async bootstrap(connectionId: string, options: BootstrapOptions = {}): Promise<OperationResult> { const c = this.store.get(connectionId); const probe = await this.test(connectionId, options.password ?? ''); return probe.ok ? this.deploy(c, options.password ?? '') : probe }
  async connect(connectionId: string, options: ConnectOptions = {}): Promise<RemoteSessionView> {
    const c = this.store.get(connectionId); const requestedPath = options.remotePath?.trim() || c.remotePath
    const old = this.sessions.get(connectionId)
    if (old && (old.state === 'starting' || old.state === 'ready')) {
      if (old.remotePath === requestedPath) return this.view(old)
      await this.disconnect(connectionId)
    }
    const password = options.password ?? ''; const test = await this.probePath(c, requestedPath, password); if (!test.ok) throw new Error(test.error || 'remote probe failed'); const remotePath = test.stdout?.match(/^DSH_REMOTE_PATH=(.+)$/m)?.[1]?.trim(); if (!remotePath) throw new Error('remote path probe returned no canonical path'); const deployed = await this.deploy(c, password); if (!deployed.ok) throw new Error(deployed.error || 'remote host deployment failed')
    const [localPort, remotePort] = await Promise.all([freePort(), freePort()]); const markerPath = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'remote-workspaces', c.id); await mkdir(markerPath, { recursive: true }); await writeFile(join(markerPath, '.dsh-remote.json'), JSON.stringify({ authority: c.name, remotePath }, null, 2) + '\n', 'utf8'); const token = randomBytes(32).toString('hex'); const askpass = c.authType === 'password' ? await makeAskpass(password) : undefined
    const args = sshConnectionArgs(c, askpass !== undefined); args.splice(args.length - 1, 0, '-o', 'ExitOnForwardFailure=yes', '-L', `127.0.0.1:${localPort}:127.0.0.1:${remotePort}`); args.push(`exec ${shellQuote(c.runtimeCommand)} ~/.cache/dsh-remote-ssh/remote-host.cjs --root ${shellQuote(remotePath)} --port ${remotePort} --token ${shellQuote(token)}`)
    const processHandle = spawn(this.sshPath, args, { env: askpass?.env ?? process.env, windowsHide: true }); const s: RemoteSession = { connection: c, process: processHandle, localPort, remotePort, remotePath, markerPath, token, state: 'starting', startedAt: new Date().toISOString(), logTail: '', askpass }; this.sessions.set(connectionId, s); processHandle.stdout.on('data', c => { s.logTail = appendTail(s.logTail, c) }); processHandle.stderr.on('data', c => { s.logTail = appendTail(s.logTail, c) }); processHandle.once('error', e => { s.state = 'failed'; s.error = e.message }); processHandle.once('close', code => { if (s.state === 'ready') s.state = 'stopped'; else if (s.state === 'starting') { s.state = 'failed'; s.error = `remote host exited during startup (${code})` } })
    try { await this.waitUntilReady(s); s.state = 'ready'; await askpass?.dispose(); s.askpass = undefined; return this.view(s) } catch (e) { s.state = 'failed'; s.error = e instanceof Error ? e.message : String(e); processHandle.kill('SIGTERM'); await askpass?.dispose(); throw new Error(`${s.error}\n${s.logTail.slice(-4000)}`) }
  }
  async selectWorkspace(connectionId: string, remotePath: string, password = ''): Promise<RemoteSessionView> {
    await this.disconnect(connectionId)
    const connection = await this.store.rememberPath(connectionId, remotePath)
    return this.connect(connectionId, { password, remotePath: connection.remotePath })
  }
  async disconnect(id: string): Promise<boolean> { const s = this.sessions.get(id); if (!s) return false; this.sessions.delete(id); await s.askpass?.dispose(); if (s.process.exitCode === null) s.process.kill('SIGTERM'); s.state = 'stopped'; return true }
  async dispose(): Promise<void> { await Promise.all([...this.sessions.keys()].map(id => this.disconnect(id))) }
  private async deploy(c: RemoteConnection, password: string): Promise<OperationResult> { const prep = await this.execRemote(c, 'set -eu; mkdir -p ~/.cache/dsh-remote-ssh', password); if (!prep.ok) return prep; const askpass = c.authType === 'password' ? await makeAskpass(password) : undefined; try { return await runProcess(this.scpPath, [...scpConnectionArgs(c, !!askpass), join(this.packageRoot, 'remote-host.cjs'), `${targetOf(c)}:.cache/dsh-remote-ssh/remote-host.cjs`], { env: askpass?.env, timeoutMs: 120_000 }) } finally { await askpass?.dispose() } }
  private async execRemote(c: RemoteConnection, command: string, password: string, timeoutMs = COMMAND_TIMEOUT_MS): Promise<OperationResult> { const askpass = c.authType === 'password' ? await makeAskpass(password) : undefined; try { return await runProcess(this.sshPath, [...sshConnectionArgs(c, !!askpass), command], { env: askpass?.env, timeoutMs }) } finally { await askpass?.dispose() } }
  private async probePath(c: RemoteConnection, remotePath: string, password: string): Promise<OperationResult> { return this.execRemote(c, `set -eu; cd -- ${shellQuote(remotePath)}; printf "DSH_REMOTE_PATH=%s\\n" "$(pwd -P)"; ${shellQuote(c.runtimeCommand)} --version`, password) }
  private async waitUntilReady(s: RemoteSession): Promise<void> { const deadline = Date.now() + BOOT_TIMEOUT_MS; let last = ''; while (Date.now() < deadline) { try { const r = await fetch(`http://127.0.0.1:${s.localPort}/health`, { headers: { authorization: `Bearer ${s.token}` } }); if (r.ok) return; last = `HTTP ${r.status}` } catch (e) { last = e instanceof Error ? e.message : String(e) } await new Promise(r => setTimeout(r, 250)) } throw new Error(`remote execution host did not become ready: ${last}`) }
  private view(s: RemoteSession): RemoteSessionView { return { connectionId: s.connection.id, authority: s.connection.name, remotePath: s.remotePath, markerPath: s.markerPath, localPort: s.localPort, remotePort: s.remotePort, state: s.state, startedAt: s.startedAt, ...(s.error ? { error: s.error } : {}), ...(s.logTail ? { logTail: s.logTail } : {}) } }
}
