export interface Channel {
  write(x: any): boolean;
  on(event: string, f: Function): void;
  end(): void;
  close(): void;
  connect(): void;
  conn:any;
}
