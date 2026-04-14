declare module "@cocalc/conat" {
  export interface DKVHandle {
    get?(key: string): Promise<unknown>;
    set?(key: string, value: unknown): Promise<void>;
  }
}
