import type { ConnectionInput, RemoteConnection } from './protocol.ts';
export declare function normalizeConnection(input: ConnectionInput, existing?: RemoteConnection): RemoteConnection;
export declare class ConnectionStore {
    private readonly file;
    private connections;
    private loaded;
    private writeQueue;
    constructor(file?: string);
    load(): Promise<void>;
    list(): RemoteConnection[];
    get(id: string): RemoteConnection;
    create(input: ConnectionInput): Promise<RemoteConnection>;
    remove(id: string): Promise<boolean>;
    rememberPath(id: string, remotePath: string): Promise<RemoteConnection>;
    private persist;
}
//# sourceMappingURL=store.d.ts.map