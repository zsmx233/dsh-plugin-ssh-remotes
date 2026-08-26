import type { OperationResult, RemoteConnection, RemoteSessionView } from './protocol.ts';
import type { ConnectionStore } from './store.ts';
export interface ConnectOptions {
    password?: string;
    remotePath?: string;
}
export interface BootstrapOptions {
    password?: string;
    installUi?: boolean;
}
export declare function shellQuote(value: string): string;
export declare function sshConnectionArgs(c: RemoteConnection, password?: boolean): string[];
export declare class RemoteSshManager {
    private readonly store;
    private readonly packageRoot;
    readonly packageVersion = "0.4.0";
    readonly sshPath: string;
    readonly scpPath: string;
    private readonly sessions;
    private constructor();
    static create(store: ConnectionStore, packageRoot: string): Promise<RemoteSshManager>;
    listSessions(): RemoteSessionView[];
    sessionForMarker(cwd: string): {
        connection: RemoteConnection;
        markerPath: string;
        remotePath: string;
    } | undefined;
    rpc<T>(connectionId: string, op: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<T>;
    test(connectionId: string, password?: string): Promise<OperationResult>;
    bootstrap(connectionId: string, options?: BootstrapOptions): Promise<OperationResult>;
    connect(connectionId: string, options?: ConnectOptions): Promise<RemoteSessionView>;
    selectWorkspace(connectionId: string, remotePath: string, password?: string): Promise<RemoteSessionView>;
    disconnect(id: string): Promise<boolean>;
    dispose(): Promise<void>;
    private deploy;
    private execRemote;
    private probePath;
    private waitUntilReady;
    private view;
}
//# sourceMappingURL=ssh-manager.d.ts.map