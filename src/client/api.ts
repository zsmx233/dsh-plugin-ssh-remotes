import { API } from '../protocol.ts'
import type {
  ConnectionInput,
  OperationResult,
  RemoteConnection,
  RemoteSessionView,
  StatusResponse,
} from '../protocol.ts'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  })
  const body = await response.json() as Record<string, unknown>
  if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : `request failed: ${response.status}`)
  return body as T
}

export class RemoteSshApi {
  async status(): Promise<StatusResponse> {
    return await request<StatusResponse>(API.status)
  }

  async list(): Promise<RemoteConnection[]> {
    const result = await request<{ connections: RemoteConnection[] }>(API.connections)
    return result.connections
  }

  async create(input: ConnectionInput): Promise<RemoteConnection> {
    const result = await request<{ connection: RemoteConnection }>(API.connections, {
      method: 'POST',
      body: JSON.stringify(input),
    })
    return result.connection
  }

  async remove(id: string): Promise<void> {
    await request(`${API.connections}?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
  }

  async test(id: string, password = ''): Promise<OperationResult> {
    const result = await request<{ result: OperationResult }>(API.test, {
      method: 'POST',
      body: JSON.stringify({ id, password }),
    })
    return result.result
  }

  async bootstrap(id: string, password = ''): Promise<OperationResult> {
    const result = await request<{ result: OperationResult }>(API.bootstrap, {
      method: 'POST',
      body: JSON.stringify({ id, password, installUi: true }),
    })
    return result.result
  }

  async connect(id: string, password = '', remotePath?: string): Promise<RemoteSessionView> {
    const result = await request<{ session: RemoteSessionView }>(API.connect, {
      method: 'POST',
      body: JSON.stringify({ id, password, ...(remotePath ? { remotePath } : {}) }),
    })
    return result.session
  }

  async select(id: string, remotePath: string, password = ''): Promise<RemoteSessionView> {
    const result = await request<{ session: RemoteSessionView }>(API.select, {
      method: 'POST',
      body: JSON.stringify({ id, remotePath, password }),
    })
    return result.session
  }

  async disconnect(id: string): Promise<void> {
    await request(API.disconnect, {
      method: 'POST',
      body: JSON.stringify({ id }),
    })
  }

  async workspace<T>(connectionId: string, op: string, args: Record<string, unknown>): Promise<T> {
    const result = await request<{ value: T }>(API.workspace, {
      method: 'POST',
      body: JSON.stringify({ connectionId, op, args }),
    })
    return result.value
  }
}
