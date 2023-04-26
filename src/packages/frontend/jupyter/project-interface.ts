/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
The public interface for the backend functionality that runs in the project.

This is only used on the backend.  However it is included in some of the
same code as the frontend (e.g., actions.ts), so we use an interface
so that Typescript can meaningfully type check everything.
*/

// see https://gist.github.com/rsms/3744301784eb3af8ed80bc746bef5eeb#file-eventlistener-d-ts
export interface EventEmitterInterface {
  addListener(event: string | symbol, listener: (...args: any[]) => void): this;
  on(event: string, listener: (...args: any[]) => void): this;
  once(event: string, listener: (...args: any[]) => void): this;
  removeListener(event: string, listener: (...args: any[]) => void): this;
  removeAllListeners(event?: string): this;
  setMaxListeners(n: number): this;
  getMaxListeners(): number;
  listeners(event: string): Function[];
  emit(event: string, ...args: any[]): boolean;
  listenerCount(type: string): number;
  // Added in Node 6...
  prependListener(event: string, listener: (...args: any[]) => void): this;
  prependOnceListener(event: string, listener: (...args: any[]) => void): this;
  eventNames(): (string | symbol)[];
}

export interface BlobStoreInterface {
  save(data, type, ipynb?): Promise<string>;
  readFile(path: string, type: string): Promise<string>;
  get(sha1: string): Promise<undefined | Buffer>;
  get_ipynb(sha1: string): Promise<undefined | string>;
  keys(): Promise<string[]>;
  delete_all_blobs(): Promise<void>;
}

export interface MessageHeader {
  msg_id: string;
  username: string;
  session: string;
  msg_type: string; // todo
  version: string;
}

export type MessageContent = any; // ??

export interface Message {
  parent_header: { msg_id: string; header: any };
  header: MessageHeader;
  content: MessageContent;
}

// an async function that takes prompt and optional password (in
// which case value not in doc and sent via different channel).
export type StdinFunction = (
  prompt: string,
  password: boolean
) => Promise<string>;

export interface ExecOpts {
  code: string;
  id?: string;
  stdin?: StdinFunction;
  halt_on_error?: boolean;
  timeout_ms?: number;
}

export interface CodeExecutionEmitterInterface extends EventEmitterInterface {
  emit_output(result: object): void;
  cancel(): void;
  close(): void;
  throw_error(err): void;
  go(): Promise<object[]>;
}

interface CodeMirrorMode {
  name: string;
  version: number;
}

interface HelpLink {
  text: string;
  url: string;
}

interface LanguageInfo {
  name: string;
  version: string;
  mimetype: string;
  codemirror_mode: CodeMirrorMode;
  pygments_lexer: string;
  nbconvert_exporter: string;
  file_extension: string;
}

export interface KernelInfo {
  nodejs_version: string;
  start_time: number;
  implementation_version: string;
  banner: string;
  protocol_version: string;
  implementation: string;
  status: string;
  language_info: LanguageInfo;
  help_links: HelpLink[];
}

interface JupyterKernelInterfaceSpawnOpts {
  env: { [key: string]: string }; // environment variables
}

export interface JupyterKernelInterface extends EventEmitterInterface {
  name: string | undefined; // name = undefined implies it is not spawnable.  It's a notebook with no actual jupyter kernel process.
  store: any;
  readonly identity: string;
  get_state(): string;
  signal(signal: string): void;
  close(): Promise<void>;
  spawn(opts?: JupyterKernelInterfaceSpawnOpts): Promise<void>;
  execute_code(opts: ExecOpts): CodeExecutionEmitterInterface;
  cancel_execute(id: string): void;
  execute_code_now(opts: ExecOpts): Promise<object[]>;
  process_output(content: any): void;
  get_blob_store(): Promise<BlobStoreInterface | undefined>;
  complete(opts: { code: any; cursor_pos: any });
  introspect(opts: {
    code: any;
    cursor_pos: any;
    detail_level: any;
  }): Promise<any>;
  kernel_info(): Promise<KernelInfo>;
  more_output(id: string): any[];
  nbconvert(args: string[], timeout?: number): Promise<void>;
  load_attachment(path: string): Promise<string>;
  process_attachment(base64, mime): Promise<string | undefined>;
  send_comm_message_to_kernel(msg_id: string, comm_id: string, data: any): void;
  get_connection_file(): string | undefined;
}
