import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { AuthType, ConnectionInput, RemoteConnection } from './protocol.ts'

interface StoreDocument {
  version: 1
  connections: RemoteConnection[]
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeAuth(value: unknown): AuthType {
  return value === 'key' || value === 'password' || value === 'config' ? value : 'agent'
}

function normalizePort(value: unknown): number {
  const port = Number(value ?? 22)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('port must be between 1 and 65535')
  return port
}

export function normalizeConnection(input: ConnectionInput, existing?: RemoteConnection): RemoteConnection {
  const name = stringValue(input.name ?? existing?.name)
  const host = stringValue(input.host ?? existing?.host)
  const user = stringValue(input.user ?? existing?.user)
  const authType = normalizeAuth(input.authType ?? existing?.authType)
  const keyPath = stringValue(input.keyPath ?? existing?.keyPath)
  const remotePath = stringValue(input.remotePath ?? existing?.remotePath) || '/'
  const runtimeCommand = stringValue(input.runtimeCommand ?? existing?.runtimeCommand) || 'node'
  if (name === '') throw new Error('name is required')
  if (host === '') throw new Error('host is required')
  if (!remotePath.startsWith('/')) throw new Error('remotePath must be an absolute POSIX path')
  if (authType === 'key' && keyPath === '') throw new Error('keyPath is required for key authentication')
  if (authType === 'password' && user === '') throw new Error('user is required for password authentication')
  if (!/^[A-Za-z0-9_./~:+-]+$/.test(runtimeCommand)) {
    throw new Error('runtimeCommand must be one Node.js executable path without shell operators')
  }
  const now = new Date().toISOString()
  return {
    id: existing?.id ?? randomUUID(),
    name,
    host,
    port: normalizePort(input.port ?? existing?.port),
    user,
    authType,
    keyPath,
    remotePath,
    recentPaths: existing?.recentPaths?.filter(path => typeof path === 'string' && path.startsWith('/')).slice(0, 12) ?? [],
    runtimeCommand,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
}

export class ConnectionStore {
  private connections = new Map<string, RemoteConnection>()
  private loaded = false
  private writeQueue: Promise<void> = Promise.resolve()

  constructor(private readonly file = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'dsh-remote-ssh.json')) {}

  async load(): Promise<void> {
    if (this.loaded) return
    this.loaded = true
    try {
      const parsed = JSON.parse(await readFile(this.file, 'utf8')) as Partial<StoreDocument>
      for (const item of Array.isArray(parsed.connections) ? parsed.connections : []) {
        try {
          const normalized = normalizeConnection(item, item)
          this.connections.set(normalized.id, normalized)
        } catch {
          // Ignore malformed legacy records while keeping valid entries usable.
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }

  list(): RemoteConnection[] {
    return [...this.connections.values()].sort((a, b) => a.name.localeCompare(b.name))
  }

  get(id: string): RemoteConnection {
    const connection = this.connections.get(id)
    if (connection === undefined) throw new Error(`unknown connection: ${id}`)
    return connection
  }

  async create(input: ConnectionInput): Promise<RemoteConnection> {
    const connection = normalizeConnection(input)
    this.connections.set(connection.id, connection)
    await this.persist()
    return connection
  }

  async remove(id: string): Promise<boolean> {
    const removed = this.connections.delete(id)
    if (removed) await this.persist()
    return removed
  }

  async rememberPath(id: string, remotePath: string): Promise<RemoteConnection> {
    if (!remotePath.startsWith('/')) throw new Error('remotePath must be an absolute POSIX path')
    const existing = this.get(id)
    const updated: RemoteConnection = {
      ...existing,
      remotePath,
      recentPaths: [remotePath, ...existing.recentPaths.filter(path => path !== remotePath)].slice(0, 12),
      updatedAt: new Date().toISOString(),
    }
    this.connections.set(id, updated)
    await this.persist()
    return updated
  }

  private async persist(): Promise<void> {
    const document: StoreDocument = { version: 1, connections: this.list() }
    this.writeQueue = this.writeQueue.then(async () => {
      await mkdir(dirname(this.file), { recursive: true })
      await writeFile(this.file, `${JSON.stringify(document, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    })
    return this.writeQueue
  }
}
