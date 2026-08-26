export declare const API_PREFIX = "/api/dsh-remote-ssh";
export declare const API: {
    readonly status: "/api/dsh-remote-ssh/status";
    readonly connections: "/api/dsh-remote-ssh/connections";
    readonly test: "/api/dsh-remote-ssh/test";
    readonly bootstrap: "/api/dsh-remote-ssh/bootstrap";
    readonly connect: "/api/dsh-remote-ssh/connect";
    readonly disconnect: "/api/dsh-remote-ssh/disconnect";
    readonly workspace: "/api/dsh-remote-ssh/workspace";
    readonly select: "/api/dsh-remote-ssh/select";
};
export type AuthType = 'agent' | 'key' | 'password' | 'config';
export interface RemoteConnection {
    id: string;
    name: string;
    host: string;
    port: number;
    user: string;
    authType: AuthType;
    keyPath: string;
    remotePath: string;
    recentPaths: string[];
    runtimeCommand: string;
    createdAt: string;
    updatedAt: string;
}
export interface ConnectionInput {
    name?: unknown;
    host?: unknown;
    port?: unknown;
    user?: unknown;
    authType?: unknown;
    keyPath?: unknown;
    remotePath?: unknown;
    runtimeCommand?: unknown;
}
export type RemoteSessionState = 'starting' | 'ready' | 'stopped' | 'failed';
export interface RemoteSessionView {
    connectionId: string;
    authority: string;
    remotePath: string;
    /** Existing local directory used as DSH's workspace identity. */
    markerPath: string;
    localPort: number;
    remotePort: number;
    state: RemoteSessionState;
    startedAt: string;
    error?: string;
    logTail?: string;
}
export interface OperationResult {
    ok: boolean;
    stdout?: string;
    stderr?: string;
    error?: string;
    elapsedMs?: number;
}
export interface StatusResponse {
    sshAvailable: boolean;
    sshPath: string;
    scpAvailable: boolean;
    scpPath: string;
    sessions: RemoteSessionView[];
    packageVersion: string;
    executionModel: 'local-control-remote-execution';
}
//# sourceMappingURL=protocol.d.ts.map