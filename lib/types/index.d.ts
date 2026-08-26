import type { Context } from '@deepseek-ai/cordis';
export declare const name = "dsh-remote-ssh";
export declare const inject: string[];
export declare function apply(ctx: Context): Promise<void>;
export { normalizeConnection } from './store.ts';
export { shellQuote, sshConnectionArgs } from './ssh-manager.ts';
export type { AuthType, ConnectionInput, OperationResult, RemoteConnection, RemoteSessionView, StatusResponse, } from './protocol.ts';
//# sourceMappingURL=index.d.ts.map