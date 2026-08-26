import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { makeRoutes } from './routes.ts'
import { RemoteSshManager } from './ssh-manager.ts'
import { ConnectionStore } from './store.ts'
import { installExecutionBridge } from './execution-bridge.ts'

export const name = 'dsh-remote-ssh'
export const inject = ['webServer', 'fs', 'shell']

export async function apply(ctx: Context): Promise<void> {
  const store = new ConnectionStore()
  await store.load()
  const packageRoot = fileURLToPath(new URL('..', import.meta.url))
  const manager = await RemoteSshManager.create(store, packageRoot)
  const disposeBridge = installExecutionBridge(ctx, manager)
  const routes = makeRoutes(store, manager)
  ctx.effect(() => {
    const disposers = routes.map(route => ctx.webServer.register(route))
    return () => {
      for (const dispose of disposers) dispose()
      disposeBridge()
      void manager.dispose()
    }
  }, 'dsh-remote-ssh: routes and tunnels')
}

export { normalizeConnection } from './store.ts'
export { shellQuote, sshConnectionArgs } from './ssh-manager.ts'
export type {
  AuthType,
  ConnectionInput,
  OperationResult,
  RemoteConnection,
  RemoteSessionView,
  StatusResponse,
} from './protocol.ts'
