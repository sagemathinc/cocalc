declare module "better-sqlite3" {
  namespace BetterSqlite3 {
    interface RunResult {
      changes: number;
      lastInsertRowid: number;
    }

    interface Statement {
      run(...params: any[]): RunResult;
      all(...params: any[]): any[];
      get(...params: any[]): any;
      iterate(...params: any[]): IterableIterator<any>;
    }

    interface Database {
      exec(source: string): this;
      prepare(source: string): Statement;
      pragma(source: string): any;
      backup(destination: string, options?: any): Promise<void>;
      transaction<T extends (...params: any[]) => any>(fn: T): T;
      close(): void;
    }
  }

  class BetterSqlite3 implements BetterSqlite3.Database {
    constructor(filename: string, options?: any);
    exec(source: string): this;
    prepare(source: string): BetterSqlite3.Statement;
    pragma(source: string): any;
    backup(destination: string, options?: any): Promise<void>;
    transaction<T extends (...params: any[]) => any>(fn: T): T;
    close(): void;
  }

  export default BetterSqlite3;
}
