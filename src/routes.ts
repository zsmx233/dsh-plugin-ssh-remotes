import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { API } from './protocol.ts'
import { readJsonBody, writeJson } from './http.ts'
import { isLoopbackRequest } from './loopback.ts'
import type { RemoteSshManager } from './ssh-manager.ts'
import type { ConnectionStore } from './store.ts'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function requestId(req: IncomingMessage): string {
  return new URL(req.url ?? '/', 'http://localhost').searchParams.get('id')?.trim() ?? ''
}

function guard(req: IncomingMessage, res: ServerResponse, methods: string[]): boolean {
  if (!isLoopbackRequest(req)) {
    writeJson(res, 403, { error: 'forbidden: loopback-only' })
    return false
  }
  if (!methods.includes(req.method ?? 'GET')) {
    writeJson(res, 405, { error: `method not allowed: ${req.method}` })
    return false
  }
  return true
}

export function makeRoutes(store: ConnectionStore, manager: RemoteSshManager): WebRoute[] {
  return [
    {
      kind: 'exact',
      path: API.status,
      handler: async (req, res) => {
        if (!guard(req, res, ['GET'])) return
        writeJson(res, 200, {
          sshAvailable: manager.sshPath !== '',
          sshPath: manager.sshPath,
          scpAvailable: manager.scpPath !== '',
          scpPath: manager.scpPath,
          sessions: manager.listSessions(),
          packageVersion: manager.packageVersion,
          executionModel: 'local-control-remote-execution',
        })
      },
    },
    {
      kind: 'exact',
      path: API.connections,
      handler: async (req, res) => {
        if (!guard(req, res, ['GET', 'POST', 'DELETE'])) return
        if (req.method === 'GET') {
          writeJson(res, 200, { connections: store.list() })
          return
        }
        if (req.method === 'DELETE') {
          const id = requestId(req)
          if (id === '') {
            writeJson(res, 400, { error: 'id is required' })
            return
          }
          await manager.disconnect(id)
          writeJson(res, 200, { removed: await store.remove(id) })
          return
        }
        const body = await readJsonBody(req)
        if (body === null) {
          writeJson(res, 400, { error: 'invalid JSON body' })
          return
        }
        try {
          writeJson(res, 201, { connection: await store.create(body) })
        } catch (error) {
          writeJson(res, 400, { error: errorMessage(error) })
        }
      },
    },
    {
      kind: 'exact',
      path: API.test,
      handler: async (req, res) => {
        if (!guard(req, res, ['POST'])) return
        const body = await readJsonBody(req)
        const id = typeof body?.id === 'string' ? body.id : ''
        const password = typeof body?.password === 'string' ? body.password : ''
        if (id === '') {
          writeJson(res, 400, { error: 'id is required' })
          return
        }
        try {
          const result = await manager.test(id, password)
          writeJson(res, result.ok ? 200 : 502, { result })
        } catch (error) {
          writeJson(res, 400, { error: errorMessage(error) })
        }
      },
    },
    {
      kind: 'exact',
      path: API.bootstrap,
      handler: async (req, res) => {
        if (!guard(req, res, ['POST'])) return
        const body = await readJsonBody(req)
        const id = typeof body?.id === 'string' ? body.id : ''
        const password = typeof body?.password === 'string' ? body.password : ''
        const installUi = body?.installUi !== false
        if (id === '') {
          writeJson(res, 400, { error: 'id is required' })
          return
        }
        try {
          const result = await manager.bootstrap(id, { password, installUi })
          writeJson(res, result.ok ? 200 : 502, { result })
        } catch (error) {
          writeJson(res, 400, { error: errorMessage(error) })
        }
      },
    },
    {
      kind: 'exact',
      path: API.connect,
      handler: async (req, res) => {
        if (!guard(req, res, ['POST'])) return
        const body = await readJsonBody(req)
        const id = typeof body?.id === 'string' ? body.id : ''
        const password = typeof body?.password === 'string' ? body.password : ''
        const remotePath = typeof body?.remotePath === 'string' ? body.remotePath : undefined
        if (id === '') {
          writeJson(res, 400, { error: 'id is required' })
          return
        }
        try {
          writeJson(res, 200, { session: await manager.connect(id, { password, remotePath }) })
        } catch (error) {
          writeJson(res, 502, { error: errorMessage(error) })
        }
      },
    },
    {
      kind: 'exact',
      path: API.select,
      handler: async (req, res) => {
        if (!guard(req, res, ['POST'])) return
        const body = await readJsonBody(req)
        const id = typeof body?.id === 'string' ? body.id : ''
        const remotePath = typeof body?.remotePath === 'string' ? body.remotePath : ''
        const password = typeof body?.password === 'string' ? body.password : ''
        if (id === '' || !remotePath.startsWith('/')) {
          writeJson(res, 400, { error: 'id and absolute remotePath are required' })
          return
        }
        try {
          writeJson(res, 200, { session: await manager.selectWorkspace(id, remotePath, password) })
        } catch (error) {
          writeJson(res, 502, { error: errorMessage(error) })
        }
      },
    },
    {
      kind: 'exact',
      path: API.disconnect,
      handler: async (req, res) => {
        if (!guard(req, res, ['POST'])) return
        const body = await readJsonBody(req)
        const id = typeof body?.id === 'string' ? body.id : ''
        if (id === '') {
          writeJson(res, 400, { error: 'id is required' })
          return
        }
        writeJson(res, 200, { disconnected: await manager.disconnect(id) })
      },
    },
    {
      kind: 'exact',
      path: API.workspace,
      handler: async (req, res) => {
        if (!guard(req, res, ['POST'])) return
        const body = await readJsonBody(req)
        const connectionId = typeof body?.connectionId === 'string' ? body.connectionId : ''
        const op = typeof body?.op === 'string' ? body.op : ''
        const args = typeof body?.args === 'object' && body.args !== null && !Array.isArray(body.args)
          ? body.args as Record<string, unknown> : {}
        const allowed = new Set(['listDir', 'readText', 'writeText', 'exec', 'stat'])
        if (connectionId === '' || !allowed.has(op)) {
          writeJson(res, 400, { error: 'invalid workspace RPC request' })
          return
        }
        try {
          writeJson(res, 200, { value: await manager.rpc(connectionId, op, args) })
        } catch (error) {
          writeJson(res, 502, { error: errorMessage(error) })
        }
      },
    },
  ]
}
