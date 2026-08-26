import type { ConnectionInput, OperationResult, RemoteConnection, RemoteSessionView, StatusResponse } from '../protocol.ts';
export declare class RemoteSshApi {
    status(): Promise<StatusResponse>;
    list(): Promise<RemoteConnection[]>;
    create(input: ConnectionInput): Promise<RemoteConnection>;
    remove(id: string): Promise<void>;
    test(id: string, password?: string): Promise<OperationResult>;
    bootstrap(id: string, password?: string): Promise<OperationResult>;
    connect(id: string, password?: string, remotePath?: string): Promise<RemoteSessionView>;
    select(id: string, remotePath: string, password?: string): Promise<RemoteSessionView>;
    disconnect(id: string): Promise<void>;
    workspace<T>(connectionId: string, op: string, args: Record<string, unknown>): Promise<T>;
}
//# sourceMappingURL=api.d.ts.map