import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
export declare const inject: string[];
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface SlotMap {
        'sidebar.footer.action': {
            kind: 'list';
            scope: 'root';
            owner: {
                wide: boolean;
            };
        };
        'shell.overlay': {
            kind: 'list';
            scope: 'root';
        };
    }
}
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map