import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from 'node:http';
export declare function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown> | null>;
export declare function writeJson(res: ServerResponse, status: number, body: unknown, headers?: OutgoingHttpHeaders): void;
//# sourceMappingURL=http.d.ts.map