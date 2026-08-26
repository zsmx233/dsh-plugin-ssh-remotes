import { isAbsolute, relative, resolve, sep } from 'node:path'
import { posix } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { RemoteSshManager } from './ssh-manager.ts'

type AnyRecord = Record<string, any>
const PREFIX = 'dsh-ssh:'
function remoteKey(connectionId: string, path: string): string { return `${PREFIX}${connectionId}:${Buffer.from(path).toString('base64url')}` }
function parseKey(value: unknown): { connectionId: string; path: string } | undefined { const text = String(value); if (!text.startsWith(PREFIX)) return; const split = text.indexOf(':', PREFIX.length); if (split < 0) return; return { connectionId: text.slice(PREFIX.length, split), path: Buffer.from(text.slice(split + 1), 'base64url').toString() } }
function remotePath(marker: string, root: string, local: string): string { if (local.startsWith('/')) return posix.normalize(local); const rel = relative(marker, local).split(sep).join('/'); return rel === '' ? root : posix.join(root, rel) }
function remoteRoute(manager: RemoteSshManager, cwd: unknown, path?: unknown) {
  const cwdText = typeof cwd === 'string' ? cwd : ''
  const direct = manager.sessionForMarker(cwdText)
  if (direct) return { ...direct, cwd: remotePath(direct.markerPath, direct.remotePath, cwdText), path: typeof path === 'string' && isAbsolute(path) && path.startsWith(direct.markerPath) ? remotePath(direct.markerPath, direct.remotePath, path) : path }
  if (typeof path === 'string') { const byPath = manager.sessionForMarker(path); if (byPath) return { ...byPath, cwd: byPath.remotePath, path: remotePath(byPath.markerPath, byPath.remotePath, path) } }
}
function rpcError(error: unknown): never { throw error }

export function installExecutionBridge(ctx: Context, manager: RemoteSshManager): () => void {
  const fs = (ctx as AnyRecord).fs as AnyRecord
  const shell = (ctx as AnyRecord).shell as AnyRecord
  const restore: Array<() => void> = []
  if (fs) {
    const original = Object.fromEntries(['resolve','processPath','fileUrl','contains','stat','lstat','readText','streamText','readBytes','listDir','writeText','editText'].map(k => [k, fs[k].bind(fs)])) as AnyRecord
    const set = (name: string, value: Function) => { const prior = fs[name]; fs[name] = value; restore.push(() => { fs[name] = prior }) }
    set('resolve', async (path: string, opts?: AnyRecord) => { const route = remoteRoute(manager, opts?.cwd, path); if (!route) return original.resolve(path, opts); const value = await manager.rpc<AnyRecord>(route.connection.id, 'resolve', { path: route.path, cwd: route.cwd }, opts?.signal); return { targetKey: remoteKey(route.connection.id, value.targetKey), displayPath: value.displayPath } })
    set('processPath', (target: AnyRecord) => parseKey(target.targetKey)?.path ?? original.processPath(target))
    set('fileUrl', (target: AnyRecord) => { const parsed = parseKey(target.targetKey); return parsed ? `dsh-remote://${parsed.connectionId}${parsed.path}` : original.fileUrl(target) })
    set('contains', (parent: AnyRecord, child: AnyRecord) => { const a = parseKey(parent.targetKey); const b = parseKey(child.targetKey); if (!a || !b) return !a && !b ? original.contains(parent, child) : false; if (a.connectionId !== b.connectionId) return false; const rel = posix.relative(a.path, b.path); return rel === '' || (rel !== '..' && !rel.startsWith('../') && !posix.isAbsolute(rel)) })
    set('stat', async (target: AnyRecord, signal?: AbortSignal) => { const p = parseKey(target.targetKey); return p ? manager.rpc(p.connectionId, 'stat', { targetKey: p.path }, signal) : original.stat(target, signal) })
    set('lstat', async (path: string, opts?: AnyRecord, signal?: AbortSignal) => { const route = remoteRoute(manager, opts?.cwd, path); return route ? manager.rpc(route.connection.id, 'lstat', { path: route.path, cwd: route.cwd }, signal) : original.lstat(path, opts, signal) })
    set('readText', async (target: AnyRecord, signal?: AbortSignal) => { const p = parseKey(target.targetKey); return p ? manager.rpc(p.connectionId, 'readText', { targetKey: p.path }, signal) : original.readText(target, signal) })
    set('streamText', async (target: AnyRecord, signal?: AbortSignal) => { const p = parseKey(target.targetKey); if (!p) return original.streamText(target, signal); const text = await manager.rpc<string>(p.connectionId, 'readText', { targetKey: p.path }, signal); return (async function* () { yield text })() })
    set('readBytes', async (target: AnyRecord, signal: AbortSignal | undefined, maxBytes: number) => { const p = parseKey(target.targetKey); if (!p) return original.readBytes(target, signal, maxBytes); const base64 = await manager.rpc<string>(p.connectionId, 'readBytes', { targetKey: p.path, maxBytes }, signal); return Buffer.from(base64, 'base64') })
    set('listDir', async (target: AnyRecord, signal?: AbortSignal) => { const p = parseKey(target.targetKey); if (!p) return original.listDir(target, signal); const rows = await manager.rpc<AnyRecord[]>(p.connectionId, 'listDir', { targetKey: p.path }, signal); return rows.map(row => ({ ...row, target: { ...row.target, targetKey: remoteKey(p.connectionId, row.target.targetKey) } })) })
    set('writeText', async (target: AnyRecord, content: string, expected?: AnyRecord, signal?: AbortSignal, policy?: AnyRecord) => { const p = parseKey(target.targetKey); return p ? manager.rpc(p.connectionId, 'writeText', { targetKey: p.path, content, expected, policy }, signal).catch(rpcError) : original.writeText(target, content, expected, signal, policy) })
    set('editText', async (target: AnyRecord, edit: AnyRecord, expected?: AnyRecord, signal?: AbortSignal, policy?: AnyRecord) => { const p = parseKey(target.targetKey); return p ? manager.rpc(p.connectionId, 'editText', { targetKey: p.path, edit, expected, policy }, signal).catch(rpcError) : original.editText(target, edit, expected, signal, policy) })
  }
  if (shell) {
    const run = shell.run.bind(shell); const start = shell.start.bind(shell)
    shell.run = async (spec: AnyRecord) => { const route = remoteRoute(manager, spec.workdir); return route ? manager.rpc(route.connection.id, 'exec', { command: spec.command, cwd: route.cwd, timeoutMs: spec.timeoutMs, env: { ...spec.env, ...spec.dshEnv } }, spec.signal) : run(spec) }
    shell.start = (spec: AnyRecord) => {
      const route = remoteRoute(manager, spec.workdir); if (!route) return start(spec)
      const controller = new AbortController(); let output = ''; let delivered = false
      const proc: AnyRecord = { status: 'running', exitCode: null, signal: null, readOutput: () => { const delta = delivered ? '' : output; delivered = true; return { delta, lossy: false } }, kill: () => { if (proc.status !== 'running') return false; proc.status = 'killed'; controller.abort(); return true } }
      proc.done = manager.rpc<AnyRecord>(route.connection.id, 'exec', { command: spec.command, cwd: route.cwd, timeoutMs: 30 * 60 * 1000, env: { ...spec.env, ...spec.dshEnv } }, controller.signal).then(result => { output = result.stdout.text + (result.stderr.text ? `${result.stdout.text.endsWith('\n') || !result.stdout.text ? '' : '\n'}[stderr]\n${result.stderr.text}` : ''); proc.exitCode = result.exitCode; proc.signal = result.signal; if (proc.status === 'running') proc.status = result.signal ? 'killed' : 'completed' }, error => { output = `remote process failed: ${error instanceof Error ? error.message : String(error)}`; proc.status = 'killed' })
      return proc
    }
    restore.push(() => { shell.run = run; shell.start = start })
  }
  return () => { for (const fn of restore.reverse()) fn() }
}
