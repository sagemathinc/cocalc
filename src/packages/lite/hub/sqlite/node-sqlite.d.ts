declare module "node:sqlite" {
  export class StatementSync {
    run(...params: any[]): any;
    all(...params: any[]): any[];
    get(...params: any[]): any;
  }

  export class DatabaseSync {
    constructor(filename: string, options?: any);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }

  export const backup: any;
  export const constants: Record<string, unknown>;

  const _default: {
    DatabaseSync: typeof DatabaseSync;
    StatementSync: typeof StatementSync;
    backup: typeof backup;
    constants: typeof constants;
  };

  export default _default;
}

