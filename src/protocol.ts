export const API_PREFIX = '/api/dsh-remote-ssh'

export const API = {
  status: `${API_PREFIX}/status`,
  connections: `${API_PREFIX}/connections`,
  test: `${API_PREFIX}/test`,
  bootstrap: `${API_PREFIX}/bootstrap`,
  connect: `${API_PREFIX}/connect`,
  disconnect: `${API_PREFIX}/disconnect`,
  workspace: `${API_PREFIX}/workspace`,
  select: `${API_PREFIX}/select`,
} as const

export type AuthType = 'agent' | 'key' | 'password' | 'config'

export interface RemoteConnection {
  id: string
  name: string
  host: string
  port: number
  user: string
  authType: AuthType
  keyPath: string
  remotePath: string
  recentPaths: string[]
  runtimeCommand: string
  createdAt: string
  updatedAt: string
}

export interface ConnectionInput {
  name?: unknown
  host?: unknown
  port?: unknown
  user?: unknown
  authType?: unknown
  keyPath?: unknown
  remotePath?: unknown
  runtimeCommand?: unknown
}

export type RemoteSessionState = 'starting' | 'ready' | 'stopped' | 'failed'

export interface RemoteSessionView {
  connectionId: string
  authority: string
  remotePath: string
  /** Existing local directory used as DSH's workspace identity. */
  markerPath: string
  localPort: number
  remotePort: number
  state: RemoteSessionState
  startedAt: string
  error?: string
  logTail?: string
}

export interface OperationResult {
  ok: boolean
  stdout?: string
  stderr?: string
  error?: string
  elapsedMs?: number
}

export interface StatusResponse {
  sshAvailable: boolean
  sshPath: string
  scpAvailable: boolean
  scpPath: string
  sessions: RemoteSessionView[]
  packageVersion: string
  executionModel: 'local-control-remote-execution'
}
