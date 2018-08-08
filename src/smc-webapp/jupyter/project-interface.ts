/*
The public interface for the backend functionality that runs in the project.

This is only used on the backend.  However it is included in some of the
same code as the frontend (e.g., actions.ts), so we use an interface
so that Typescript can meaningfully type check everything.
*/

export type StdinFunction = (options: object, cb: Function) => void;

export type MesgHandler = (mesg: Message) => void;

export interface ExecOpts {
  code: string;
  id?: string;
  stdin?: StdinFunction;
  halt_on_error?: boolean;
}

export interface CodeExecutionEmitterInterface {
  emit_output(result: object): void;
  request_stdin(mesg, cb: (err, response: string) => void): void;
  cancel(): void;
  close(): void;
  throw_error(err): void;
  async go(): Promise<object[]>;
}

export type KernelInfo = object;

export interface JupyterKernelInterface {
  get_state(): string;
  signal(signal: string): void;
  usage(): Promise<{ cpu: number; memory: number }>;
  close(): Promise<void>;
  execute_code(opts: ExecOpts): CodeExecutionEmitterInterface;
  cancel_execute(id: string): void;
  async execute_code_now(opts: ExecOpts): Promise<object[]>;
  process_output(content: any): void;
  async get_kernel_data(): Promise<any>;
  async complete(opts: { code: any; cursor_pos: any });
  async introspect(opts: {
    code: any;
    cursor_pos: any;
    detail_level: any;
  }): Promise<any>;
  async kernel_info(): Promise<KernelInfo>;
  more_output(id: string): any[] ;
  async nbconvert(args: string[], timeout?: number): Promise<void>;
  async load_attachment(path: string): Promise<string>;
  process_attachment(base64, mime): string
}
