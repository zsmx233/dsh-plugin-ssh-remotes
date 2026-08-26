import { useEffect, useState, useSyncExternalStore } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type { ConnectionInput, RemoteConnection, RemoteSessionView, StatusResponse } from '../protocol.ts'
import { RemoteSshApi } from './api.ts'

export const inject = ['slots', 'workspaces', 'sessions', 'betterSidebar']

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'sidebar.footer.action': {
      kind: 'list'
      scope: 'root'
      owner: { wide: boolean }
    }
    'shell.overlay': {
      kind: 'list'
      scope: 'root'
    }
  }
}

interface RemoteContext {
  authority: string
  path: string
  returnUrl?: string
}

const panelState = {
  open: false,
  listeners: new Set<() => void>(),
  get(): boolean { return this.open },
  set(value: boolean): void {
    this.open = value
    for (const listener of this.listeners) listener()
  },
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  },
}

const CSS = `
.dsh-rssh-backdrop{position:fixed;inset:0;z-index:1200;background:rgba(0,0,0,.52);display:flex;align-items:center;justify-content:center;padding:20px}
.dsh-rssh-panel{width:min(920px,96vw);max-height:90vh;display:flex;flex-direction:column;background:var(--dsw-alias-bg-overlay,#1b1c22);color:var(--dsw-alias-label-primary,#f0f1f4);border:1px solid var(--dsw-alias-border-l1,#3b3d47);border-radius:12px;box-shadow:0 18px 60px rgba(0,0,0,.55)}
.dsh-rssh-head,.dsh-rssh-row,.dsh-rssh-actions,.dsh-rssh-status{display:flex;align-items:center;gap:8px}
.dsh-rssh-head{padding:14px 16px;border-bottom:1px solid var(--dsw-alias-border-l1,#3b3d47)}
.dsh-rssh-title{font-size:15px;font-weight:650}.dsh-rssh-spacer{flex:1}.dsh-rssh-body{overflow:auto;padding:14px 16px;display:flex;flex-direction:column;gap:12px}
.dsh-rssh-section{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--dsw-alias-label-secondary,#9fa2ad)}
.dsh-rssh-card{border:1px solid var(--dsw-alias-border-l1,#3b3d47);border-radius:9px;padding:11px;background:var(--dsw-alias-bg-layer-1,#202129)}
.dsh-rssh-row{align-items:flex-start}.dsh-rssh-meta{min-width:0;flex:1}.dsh-rssh-name{font-weight:650}.dsh-rssh-desc,.dsh-rssh-hint{font-size:12px;color:var(--dsw-alias-label-secondary,#a3a6b0);word-break:break-all;margin-top:3px}
.dsh-rssh-actions{flex-wrap:wrap;justify-content:flex-end}.dsh-rssh-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.dsh-rssh-full{grid-column:1/-1}
.dsh-rssh-field{display:flex;flex-direction:column;gap:4px}.dsh-rssh-label{font-size:11px;color:var(--dsw-alias-label-secondary,#a3a6b0)}
.dsh-rssh-input,.dsh-rssh-select{width:100%;box-sizing:border-box;color:inherit;background:var(--dsw-alias-bg-base,#15161b);border:1px solid var(--dsw-alias-border-l1,#3b3d47);border-radius:6px;padding:7px 8px;font:inherit}
.dsh-rssh-btn{border:1px solid var(--dsw-alias-border-l2,#4a4d59);border-radius:6px;padding:6px 10px;background:var(--dsw-alias-bg-layer-2,#292b34);color:inherit;cursor:pointer;white-space:nowrap}.dsh-rssh-btn:hover{border-color:var(--dsw-alias-brand-primary,#5b8def)}.dsh-rssh-btn:disabled{opacity:.48;cursor:default}
.dsh-rssh-primary{background:var(--dsw-alias-brand-primary,#4e7fe0);border-color:transparent;color:#fff}.dsh-rssh-danger:hover{border-color:#dc6464}.dsh-rssh-error{color:#ef8585;font-size:12px;white-space:pre-wrap}.dsh-rssh-ok{color:#69cc96;font-size:12px;white-space:pre-wrap}
.dsh-rssh-pill{font-size:11px;padding:2px 7px;border-radius:999px;background:var(--dsw-alias-bg-layer-2,#292b34)}.dsh-rssh-pill.ready{color:#69cc96}.dsh-rssh-pill.failed{color:#ef8585}
.dsh-rssh-footer-action{border:0;background:transparent;color:inherit;cursor:pointer;padding:6px 9px;font-size:12px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dsh-rssh-footer-action:hover{color:var(--dsw-alias-brand-primary,#6b9cff)}
.dsh-rssh-adopting{position:fixed;left:50%;top:16px;transform:translateX(-50%);z-index:1500;padding:8px 13px;border-radius:8px;background:#20232c;color:#fff;border:1px solid #4b5060;box-shadow:0 8px 24px rgba(0,0,0,.35);font-size:12px}
.dsh-rssh-explorer{height:100%;display:flex;flex-direction:column;background:var(--dsw-alias-bg-base,#15161b);color:inherit}.dsh-rssh-explorer-head{display:flex;gap:6px;align-items:center;padding:7px;border-bottom:1px solid var(--dsw-alias-border-l1,#343640)}.dsh-rssh-path{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;opacity:.75;flex:1}.dsh-rssh-files{min-height:120px;overflow:auto;border-bottom:1px solid var(--dsw-alias-border-l1,#343640)}.dsh-rssh-file{display:flex;width:100%;gap:7px;border:0;background:transparent;color:inherit;text-align:left;padding:5px 9px;cursor:pointer}.dsh-rssh-file:hover{background:var(--dsw-alias-bg-layer-2,#292b34)}.dsh-rssh-editor{flex:1;min-height:140px;resize:none;border:0;border-bottom:1px solid var(--dsw-alias-border-l1,#343640);background:#111218;color:inherit;padding:9px;font:12px/1.5 ui-monospace,Consolas,monospace}.dsh-rssh-command{display:flex;gap:6px;padding:7px}.dsh-rssh-command input{flex:1}.dsh-rssh-output{max-height:130px;overflow:auto;margin:0;padding:8px;white-space:pre-wrap;font:11px/1.4 ui-monospace,Consolas,monospace}
.dsh-rssh-targets{height:100%;overflow:auto;padding:8px;background:var(--dsw-alias-bg-base,#15161b)}.dsh-rssh-target-host{border:1px solid var(--dsw-alias-border-l1,#343640);border-radius:7px;margin-bottom:7px;overflow:hidden}.dsh-rssh-target-main{display:flex;align-items:center;gap:7px;padding:8px}.dsh-rssh-target-main .dsh-rssh-meta{min-width:0}.dsh-rssh-target-folder{display:flex;align-items:center;gap:6px;width:100%;border:0;border-top:1px solid var(--dsw-alias-border-l1,#343640);background:transparent;color:inherit;padding:6px 10px 6px 25px;text-align:left;cursor:pointer;font-size:11px}.dsh-rssh-target-folder:hover{background:var(--dsw-alias-bg-layer-2,#292b34)}.dsh-rssh-picker-list{min-height:180px;max-height:55vh;overflow:auto;border:1px solid var(--dsw-alias-border-l1,#343640);border-radius:6px;margin-top:7px}.dsh-rssh-picker-row{display:flex;width:100%;gap:7px;border:0;background:transparent;color:inherit;padding:7px 9px;text-align:left;cursor:pointer}.dsh-rssh-picker-row:hover{background:var(--dsw-alias-bg-layer-2,#292b34)}
@media(max-width:720px){.dsh-rssh-form{grid-template-columns:1fr}.dsh-rssh-full{grid-column:1}.dsh-rssh-row{flex-direction:column}.dsh-rssh-actions{justify-content:flex-start}}
`

function remoteContextFromUrl(): RemoteContext | undefined {
  const params = new URLSearchParams(window.location.search)
  const authority = params.get('dshRemoteAuthority')?.trim() ?? ''
  const path = params.get('dshRemotePath')?.trim() ?? ''
  if (authority === '' || !path.startsWith('/')) return undefined
  const rawReturn = params.get('dshRemoteReturn')
  let returnUrl: string | undefined
  if (rawReturn !== null) {
    try {
      const parsed = new URL(rawReturn)
      if (parsed.protocol === 'http:' && (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost' || parsed.hostname === '[::1]')) {
        returnUrl = parsed.href
      }
    } catch {
      // Ignore an invalid or non-loopback return target.
    }
  }
  return { authority, path, returnUrl }
}

function RemoteWorkspaceInitializer({ ctx, remote }: { ctx: ClientContext; remote: RemoteContext }): JSX.Element | null {
  const [message, setMessage] = useState(`正在连接 ${remote.authority}…`)
  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const workspace = await ctx.workspaces.create({ path: remote.path })
        if (!active) return
        setMessage(`正在打开远程工作区 ${remote.path}…`)
        const sessionId = await ctx.workspaces.connectWorkspace(workspace.workspaceId)
        if (!active) return
        ctx.sessions.open(sessionId)
        const url = new URL(window.location.href)
        url.searchParams.delete('dshRemoteAuthority')
        url.searchParams.delete('dshRemotePath')
        url.searchParams.delete('dshRemoteReturn')
        window.history.replaceState({}, '', url)
        setMessage('')
      } catch (error) {
        if (active) setMessage(`远程工作区打开失败：${error instanceof Error ? error.message : String(error)}`)
      }
    })()
    return () => { active = false }
  }, [ctx, remote.authority, remote.path])
  return message === '' ? null : <div className="dsh-rssh-adopting">{message}</div>
}

const emptyForm: ConnectionInput = {
  name: '', host: '', port: 22, user: '', authType: 'agent', keyPath: '', remotePath: '/', runtimeCommand: 'node',
}

interface RemoteEntry { name: string; type: 'file' | 'directory' | 'other'; isSymlink?: boolean; broken?: boolean; target: { targetKey: string; displayPath: string } }

function RemoteExplorer({ api, scope }: { api: RemoteSshApi; scope: { sessionId: string; cwd?: string } }): JSX.Element {
  const [session, setSession] = useState<RemoteSessionView>()
  const [dir, setDir] = useState('')
  const [entries, setEntries] = useState<RemoteEntry[]>([])
  const [file, setFile] = useState('')
  const [content, setContent] = useState('')
  const [command, setCommand] = useState('git status --short --branch')
  const [output, setOutput] = useState('')
  const [error, setError] = useState('')
  useEffect(() => { void api.status().then(status => {
    const found = status.sessions.find(item => item.markerPath === scope.cwd && item.state === 'ready')
    setSession(found)
    if (found) setDir(found.remotePath)
  }).catch(e => setError(e instanceof Error ? e.message : String(e))) }, [api, scope.cwd])
  const load = async (path: string): Promise<void> => {
    if (!session) return
    try { setError(''); setEntries(await api.workspace<RemoteEntry[]>(session.connectionId, 'listDir', { targetKey: path })); setDir(path) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }
  useEffect(() => { if (session && dir) void load(dir) }, [session?.connectionId, dir === '' ? '' : 'initial'])
  if (!session) return <div className="dsh-rssh-explorer"><div className="dsh-rssh-error" style={{ padding: 10 }}>该会话没有活动的 Remote-SSH 执行面。请从 Remote-SSH 管理器重新连接。</div></div>
  return <div className="dsh-rssh-explorer">
    <div className="dsh-rssh-explorer-head"><button className="dsh-rssh-btn" onClick={() => void load(dir.replace(/\/+[^/]+\/?$/, '') || '/')}>↑</button><span className="dsh-rssh-path">[SSH: {session.authority}] {dir}</span><button className="dsh-rssh-btn" onClick={() => void load(dir)}>刷新</button></div>
    {error ? <div className="dsh-rssh-error" style={{ padding: 7 }}>{error}</div> : null}
    <div className="dsh-rssh-files">{entries.map(entry => <button className="dsh-rssh-file" key={entry.target.targetKey} onClick={() => {
      if (entry.type === 'directory') void load(entry.target.targetKey)
      else void api.workspace<string>(session.connectionId, 'readText', { targetKey: entry.target.targetKey }).then(text => { setFile(entry.target.targetKey); setContent(text) }).catch(e => setError(e instanceof Error ? e.message : String(e)))
    }} disabled={entry.broken === true}><span>{entry.broken ? '×' : entry.type === 'directory' ? '▸' : entry.isSymlink ? '↗' : '·'}</span><span>{entry.name}</span></button>)}</div>
    {file ? <><div className="dsh-rssh-explorer-head"><span className="dsh-rssh-path">{file}</span><button className="dsh-rssh-btn dsh-rssh-primary" onClick={() => void api.workspace(session.connectionId, 'writeText', { targetKey: file, content, policy: { mode: 'workspace-write' } }).then(() => setOutput('已保存')).catch(e => setError(e instanceof Error ? e.message : String(e)))}>保存</button></div><textarea className="dsh-rssh-editor" value={content} onChange={e => setContent(e.target.value)} /></> : null}
    <div className="dsh-rssh-command"><input className="dsh-rssh-input" value={command} onChange={e => setCommand(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void api.workspace<{stdout:{text:string};stderr:{text:string};exitCode:number|null}>(session.connectionId, 'exec', { command, cwd: dir, timeoutMs: 60000 }).then(r => setOutput(`${r.stdout.text}${r.stderr.text ? `\n[stderr]\n${r.stderr.text}` : ''}\n[exit ${r.exitCode}]`)).catch(x => setError(x instanceof Error ? x.message : String(x))) }} /><button className="dsh-rssh-btn" onClick={() => void api.workspace<{stdout:{text:string};stderr:{text:string};exitCode:number|null}>(session.connectionId, 'exec', { command, cwd: dir, timeoutMs: 60000 }).then(r => setOutput(`${r.stdout.text}${r.stderr.text ? `\n[stderr]\n${r.stderr.text}` : ''}\n[exit ${r.exitCode}]`)).catch(x => setError(x instanceof Error ? x.message : String(x)))}>运行</button></div>
    {output ? <pre className="dsh-rssh-output">{output}</pre> : null}
  </div>
}

async function adoptRemoteWorkspace(ctx: ClientContext, session: RemoteSessionView): Promise<void> {
  const workspace = await ctx.workspaces.create({ path: session.markerPath })
  const sessionId = await ctx.workspaces.connectWorkspace(workspace.workspaceId)
  ctx.sessions.open(sessionId)
  ;(ctx as unknown as { betterSidebar?: { openTab(seed: { type: string }, scope?: { sessionId: string; cwd?: string }): void } }).betterSidebar?.openTab({ type: 'remote-ssh:explorer' }, { sessionId, cwd: session.markerPath })
}

interface PickerState { connection: RemoteConnection; session: RemoteSessionView; path: string; entries: RemoteEntry[] }

function RemoteTargets({ ctx, api }: { ctx: ClientContext; api: RemoteSshApi }): JSX.Element {
  const [connections, setConnections] = useState<RemoteConnection[]>([])
  const [passwords, setPasswords] = useState<Record<string, string>>({})
  const [picker, setPicker] = useState<PickerState>()
  const [pathInput, setPathInput] = useState('/')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const refresh = (): Promise<void> => api.list().then(setConnections)
  useEffect(() => { void refresh().catch(e => setError(e instanceof Error ? e.message : String(e))) }, [])
  const passwordOf = (connection: RemoteConnection): string => passwords[connection.id] ?? ''
  const loadDir = async (connection: RemoteConnection, session: RemoteSessionView, path: string): Promise<void> => {
    const entries = await api.workspace<RemoteEntry[]>(connection.id, 'listDir', { targetKey: path })
    const canonical = path === '' ? '/' : path
    setPathInput(canonical)
    setPicker({ connection, session, path: canonical, entries })
  }
  const browse = async (connection: RemoteConnection): Promise<void> => {
    setBusy(connection.id); setError('')
    try {
      const session = await api.connect(connection.id, passwordOf(connection), '/')
      await loadDir(connection, session, connection.remotePath || '/')
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy('') }
  }
  const open = async (connection: RemoteConnection, path: string): Promise<void> => {
    setBusy(`open:${connection.id}`); setError('')
    try {
      const session = await api.select(connection.id, path, passwordOf(connection))
      await adoptRemoteWorkspace(ctx, session)
      await refresh()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy('') }
  }
  if (picker) {
    const parent = picker.path.replace(/\/+[^/]+\/?$/, '') || '/'
    return <div className="dsh-rssh-targets">
      <div className="dsh-rssh-explorer-head"><button className="dsh-rssh-btn" onClick={() => setPicker(undefined)}>← 主机</button><strong>{picker.connection.name}</strong><span className="dsh-rssh-spacer" /><button className="dsh-rssh-btn dsh-rssh-primary" disabled={busy !== ''} onClick={() => void open(picker.connection, picker.path)}>打开此文件夹</button></div>
      <div className="dsh-rssh-command"><button className="dsh-rssh-btn" onClick={() => void loadDir(picker.connection, picker.session, parent)}>↑</button><input className="dsh-rssh-input" value={pathInput} onChange={e => setPathInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void loadDir(picker.connection, picker.session, pathInput).catch(x => setError(x instanceof Error ? x.message : String(x))) }} /><button className="dsh-rssh-btn" onClick={() => void loadDir(picker.connection, picker.session, pathInput).catch(x => setError(x instanceof Error ? x.message : String(x)))}>转到</button></div>
      {error ? <div className="dsh-rssh-error">{error}</div> : null}
      <div className="dsh-rssh-picker-list">{picker.entries.filter(entry => entry.type === 'directory' && !entry.broken).map(entry => <button className="dsh-rssh-picker-row" key={entry.target.targetKey} onDoubleClick={() => void open(picker.connection, entry.target.targetKey)} onClick={() => void loadDir(picker.connection, picker.session, entry.target.targetKey).catch(x => setError(x instanceof Error ? x.message : String(x)))}><span>▸</span><span>{entry.name}</span></button>)}</div>
      <div className="dsh-rssh-hint" style={{ marginTop: 7 }}>单击进入目录，双击直接作为工作区打开。选定后执行 Host 会重启并只授权该目录。</div>
    </div>
  }
  return <div className="dsh-rssh-targets">
    <div className="dsh-rssh-explorer-head"><strong>SSH 连接目标</strong><span className="dsh-rssh-spacer" /><button className="dsh-rssh-btn" onClick={() => panelState.set(true)}>＋ 新建/管理</button><button className="dsh-rssh-btn" onClick={() => void refresh()}>刷新</button></div>
    {error ? <div className="dsh-rssh-error" style={{ padding: 7 }}>{error}</div> : null}
    {connections.length === 0 ? <div className="dsh-rssh-hint" style={{ padding: 10 }}>没有 SSH 主机。点击“新建/管理”添加连接。</div> : null}
    {connections.map(connection => <div className="dsh-rssh-target-host" key={connection.id}>
      <div className="dsh-rssh-target-main"><span>▸</span><div className="dsh-rssh-meta"><div className="dsh-rssh-name">{connection.name}</div><div className="dsh-rssh-desc">{connection.user ? `${connection.user}@` : ''}{connection.host}:{connection.port}</div></div><span className="dsh-rssh-spacer" />{connection.authType === 'password' ? <input className="dsh-rssh-input" style={{ width: 130 }} type="password" placeholder="SSH 密码" value={passwordOf(connection)} onChange={e => setPasswords(current => ({ ...current, [connection.id]: e.target.value }))} /> : null}<button className="dsh-rssh-btn dsh-rssh-primary" disabled={busy !== '' || (connection.authType === 'password' && passwordOf(connection) === '')} onClick={() => void browse(connection)}>{busy === connection.id ? '连接中…' : '选择文件夹'}</button></div>
      {connection.recentPaths.map(path => <button className="dsh-rssh-target-folder" key={path} disabled={busy !== '' || (connection.authType === 'password' && passwordOf(connection) === '')} onClick={() => void open(connection, path)}><span>⌁</span><span className="dsh-rssh-path">{path}</span><span>打开</span></button>)}
    </div>)}
  </div>
}

function ManagerPanel({ ctx, api }: { ctx: ClientContext; api: RemoteSshApi }): JSX.Element | null {
  const open = useSyncExternalStore(panelState.subscribe.bind(panelState), panelState.get.bind(panelState))
  const [status, setStatus] = useState<StatusResponse>()
  const [connections, setConnections] = useState<RemoteConnection[]>([])
  const [form, setForm] = useState<ConnectionInput>({ ...emptyForm })
  const [passwords, setPasswords] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState<{ ok: boolean; text: string }>()

  const refresh = async (): Promise<void> => {
    const [nextStatus, nextConnections] = await Promise.all([api.status(), api.list()])
    setStatus(nextStatus)
    setConnections(nextConnections)
  }
  useEffect(() => {
    if (!open) return
    void refresh().catch(error => setMessage({ ok: false, text: error instanceof Error ? error.message : String(error) }))
  }, [open])
  if (!open) return null

  const action = async (key: string, work: () => Promise<void>): Promise<void> => {
    setBusy(key)
    setMessage(undefined)
    try {
      await work()
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : String(error) })
    } finally {
      setBusy('')
    }
  }
  const sessions = new Map((status?.sessions ?? []).map(session => [session.connectionId, session]))
  const setField = (key: keyof ConnectionInput, value: unknown): void => setForm(current => ({ ...current, [key]: value }))

  return <div className="dsh-rssh-backdrop" onMouseDown={() => panelState.set(false)}>
    <div className="dsh-rssh-panel" onMouseDown={event => event.stopPropagation()}>
      <div className="dsh-rssh-head">
        <span className="dsh-rssh-title">Remote-SSH 工作区</span>
        <span className="dsh-rssh-pill">Local control · Remote execution</span>
        <span className="dsh-rssh-spacer" />
        <button className="dsh-rssh-btn" onClick={() => panelState.set(false)}>关闭</button>
      </div>
      <div className="dsh-rssh-body">
        <div className="dsh-rssh-status">
          <span className={status?.sshAvailable ? 'dsh-rssh-ok' : 'dsh-rssh-error'}>
            {status ? `OpenSSH: ${status.sshAvailable ? status.sshPath : '不可用'}` : '正在检测 OpenSSH…'}
          </span>
          <span className="dsh-rssh-spacer" />
          {status ? <span className="dsh-rssh-hint">轻量执行面 · 本地会话与 Agent</span> : null}
        </div>
        {message ? <div className={message.ok ? 'dsh-rssh-ok' : 'dsh-rssh-error'}>{message.text}</div> : null}
        <div className="dsh-rssh-section">远程工作区</div>
        {connections.length === 0 ? <div className="dsh-rssh-hint">尚未添加连接。远端只需要 Node.js 与 SSH，不需要安装完整 DSH。</div> : null}
        {connections.map(connection => {
          const session = sessions.get(connection.id)
          const password = passwords[connection.id] ?? ''
          const authReady = connection.authType !== 'password' || password !== ''
          return <div className="dsh-rssh-card" key={connection.id}>
            <div className="dsh-rssh-row">
              <div className="dsh-rssh-meta">
                <div className="dsh-rssh-name">{connection.name} {session ? <span className={`dsh-rssh-pill ${session.state}`}>{session.state}</span> : null}</div>
                <div className="dsh-rssh-desc">{connection.authType === 'config' ? connection.host : `${connection.user ? `${connection.user}@` : ''}${connection.host}:${connection.port}`} · {connection.remotePath}</div>
                <div className="dsh-rssh-desc">认证：{connection.authType} · 运行时：{connection.runtimeCommand}</div>
                {connection.authType === 'password' ? <input className="dsh-rssh-input" type="password" autoComplete="off" placeholder="本次操作的 SSH 密码（仅内存）" value={password} onChange={event => setPasswords(values => ({ ...values, [connection.id]: event.target.value }))} /> : null}
                {session?.error ? <div className="dsh-rssh-error">{session.error}</div> : null}
              </div>
              <div className="dsh-rssh-actions">
                <button className="dsh-rssh-btn" disabled={busy !== '' || !authReady} onClick={() => void action(`test:${connection.id}`, async () => {
                  const result = await api.test(connection.id, password)
                  setMessage({ ok: result.ok, text: result.ok ? (result.stdout || 'SSH 与远程目录正常') : (result.error || '检测失败') })
                })}>{busy === `test:${connection.id}` ? '检测中…' : '检测'}</button>
                <button className="dsh-rssh-btn" disabled={busy !== '' || !authReady} onClick={() => {
                  if (!window.confirm(`将在 ${connection.name} 部署轻量 Remote Host（单个 Node.js 文件）。是否继续？`)) return
                  void action(`setup:${connection.id}`, async () => {
                    const result = await api.bootstrap(connection.id, password)
                    if (!result.ok) throw new Error(result.error || '远端安装失败')
                    setMessage({ ok: true, text: '轻量 Remote Host 已部署，可以连接。' })
                  })
                }}>{busy === `setup:${connection.id}` ? '部署中…' : '部署轻量 Host'}</button>
                {session?.state === 'ready'
                  ? <button className="dsh-rssh-btn" disabled={busy !== ''} onClick={() => void action(`disconnect:${connection.id}`, async () => { await api.disconnect(connection.id); await refresh() })}>断开</button>
                  : <button className="dsh-rssh-btn dsh-rssh-primary" disabled={busy !== '' || !authReady} onClick={() => {
                      panelState.set(false)
                      ;(ctx as unknown as { betterSidebar?: { openTab(seed: { type: string }): void } }).betterSidebar?.openTab({ type: 'remote-ssh:targets' })
                    }}>选择工作区</button>}
                <button className="dsh-rssh-btn dsh-rssh-danger" disabled={busy !== ''} onClick={() => {
                  if (!window.confirm(`删除连接“${connection.name}”？不会删除远程目录。`)) return
                  void action(`remove:${connection.id}`, async () => { await api.remove(connection.id); await refresh() })
                }}>删除</button>
              </div>
            </div>
          </div>
        })}
        <div className="dsh-rssh-section">添加连接</div>
        <div className="dsh-rssh-card dsh-rssh-form">
          <label className="dsh-rssh-field"><span className="dsh-rssh-label">显示名称 *</span><input className="dsh-rssh-input" value={String(form.name ?? '')} onChange={event => setField('name', event.target.value)} placeholder="dev-server" /></label>
          <label className="dsh-rssh-field"><span className="dsh-rssh-label">主机或 SSH config 别名 *</span><input className="dsh-rssh-input" value={String(form.host ?? '')} onChange={event => setField('host', event.target.value)} placeholder="192.168.1.20" /></label>
          <label className="dsh-rssh-field"><span className="dsh-rssh-label">用户</span><input className="dsh-rssh-input" value={String(form.user ?? '')} onChange={event => setField('user', event.target.value)} placeholder="root" /></label>
          <label className="dsh-rssh-field"><span className="dsh-rssh-label">端口</span><input className="dsh-rssh-input" type="number" value={Number(form.port ?? 22)} onChange={event => setField('port', Number(event.target.value))} /></label>
          <label className="dsh-rssh-field"><span className="dsh-rssh-label">认证方式</span><select className="dsh-rssh-select" value={String(form.authType ?? 'agent')} onChange={event => setField('authType', event.target.value)}><option value="agent">SSH Agent / 默认密钥</option><option value="key">指定密钥</option><option value="password">用户名 + 密码</option><option value="config">~/.ssh/config 别名</option></select></label>
          <label className="dsh-rssh-field"><span className="dsh-rssh-label">初始浏览目录</span><input className="dsh-rssh-input" value={String(form.remotePath ?? '/')} onChange={event => setField('remotePath', event.target.value)} placeholder="/" /></label>
          {form.authType === 'key' ? <label className="dsh-rssh-field dsh-rssh-full"><span className="dsh-rssh-label">本机私钥路径 *</span><input className="dsh-rssh-input" value={String(form.keyPath ?? '')} onChange={event => setField('keyPath', event.target.value)} placeholder="C:\\Users\\you\\.ssh\\id_ed25519" /></label> : null}
          <label className="dsh-rssh-field"><span className="dsh-rssh-label">远端 Node.js 命令</span><input className="dsh-rssh-input" value={String(form.runtimeCommand ?? 'node')} onChange={event => setField('runtimeCommand', event.target.value)} /></label>
          <div className="dsh-rssh-field"><span className="dsh-rssh-label">&nbsp;</span><button className="dsh-rssh-btn dsh-rssh-primary" disabled={busy !== ''} onClick={() => void action('create', async () => { await api.create(form); setForm({ ...emptyForm }); await refresh() })}>{busy === 'create' ? '添加中…' : '添加 SSH 主机'}</button></div>
        </div>
        <div className="dsh-rssh-hint">安全模型：Remote Host 仅绑定 127.0.0.1，随机令牌鉴权，所有 RPC 经过 SSH 隧道；文件访问被限制在工作区根目录内。密码不会落盘。</div>
      </div>
    </div>
  </div>
}

function RemoteRoot({ ctx, api, remote }: { ctx: ClientContext; api: RemoteSshApi; remote?: RemoteContext }): JSX.Element {
  return <>{remote ? <RemoteWorkspaceInitializer ctx={ctx} remote={remote} /> : null}<ManagerPanel ctx={ctx} api={api} /></>
}

function FooterAction({ ctx, wide, remote }: { ctx: ClientContext; wide?: boolean; remote?: RemoteContext }): JSX.Element {
  const label = remote ? `[SSH: ${remote.authority}]` : (wide ? 'Remote-SSH' : 'SSH')
  return <button className="dsh-rssh-footer-action" title={remote ? `${remote.authority}: ${remote.path}` : 'Remote-SSH 工作区'} onClick={() => {
    if (remote?.returnUrl) window.location.assign(remote.returnUrl)
    else {
      const sidebar = (ctx as unknown as { betterSidebar?: { openTab(seed: { type: string }): void } }).betterSidebar
      if (sidebar) sidebar.openTab({ type: 'remote-ssh:targets' })
      else panelState.set(!panelState.get())
    }
  }}>{label}</button>
}

export function apply(ctx: ClientContext): void {
  const api = new RemoteSshApi()
  const remote = remoteContextFromUrl()
  const style = document.createElement('style')
  style.dataset.plugin = '@dsh-external/dsh-remote-ssh'
  style.textContent = CSS
  document.head.appendChild(style)

  const betterSidebar = (ctx as unknown as { betterSidebar?: { registerTab(tab: unknown): () => void } }).betterSidebar
  const disposeTargets = betterSidebar?.registerTab({
    id: 'remote-ssh:targets', title: 'SSH 连接目标', order: 10, single: true,
    component: () => <RemoteTargets ctx={ctx} api={api} />,
  })
  const disposeExplorer = betterSidebar?.registerTab({
    id: 'remote-ssh:explorer', title: 'Remote Explorer', order: 15, single: true,
    component: ({ scope }: { scope: { sessionId: string; cwd?: string } }) => <RemoteExplorer api={api} scope={scope} />,
  })

  const footer = ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register(
    { name: 'sidebar.footer.action', id: 'dsh-remote-ssh.open', order: -20, label: 'Remote-SSH' },
    (props: { wide?: boolean }) => <FooterAction ctx={ctx} wide={props.wide} remote={remote} />,
  ))
  const overlay = ctx.slots.inject('shell.overlay', () => ctx.slots.register(
    { name: 'shell.overlay', id: 'dsh-remote-ssh.panel', order: 15, label: 'Remote-SSH Workspaces' },
    () => <RemoteRoot ctx={ctx} api={api} remote={remote} />,
  ))
  ctx.effect(() => () => {
    footer()
    overlay()
    disposeTargets?.()
    disposeExplorer?.()
    style.remove()
  }, 'dsh-remote-ssh: client surfaces')
}
