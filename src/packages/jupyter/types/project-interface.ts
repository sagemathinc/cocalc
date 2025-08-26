/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
The public interface for the backend functionality that runs in the project.

This is only used on the backend.  However it is included in some of the
same code as the frontend (e.g., actions.ts), so we use an interface
so that Typescript can meaningfully type check everything.
*/

import type { JupyterSockets } from "@cocalc/jupyter/zmq";
import type { KernelInfo } from "@cocalc/util/jupyter/types";
export type { KernelInfo };
import type { EventIterator } from "@cocalc/util/event-iterator";
import { type BackendState, type KernelState } from "@cocalc/jupyter/types";

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
  // get base64 encoded binary data out of the blob store.
  getBase64(sha1: string): string | undefined;
  // utf8 string
  getString(sha1: string): string | undefined;
  // save a string encoded in base64 as binary data in the blob store
  saveBase64: (base64: string) => string | undefined;
  // read file from disk and store in blob store.  returns sha1 hash of contents of file.
  readFile(path: string): Promise<string>;
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
  password: boolean,
) => Promise<string>;

export interface ExecOpts {
  code: string;
  id?: string;
  stdin?: StdinFunction;
  halt_on_error?: boolean;
  timeout_ms?: number;
}

export type OutputMessage = any; // todo

export interface CodeExecutionEmitterInterface extends EventEmitterInterface {
  emit_output(result: OutputMessage): void;
  cancel(): void;
  close(): void;
  throw_error(err): void;
  go(): Promise<void>;
  iter(): EventIterator<OutputMessage>;
  waitUntilDone: () => Promise<void>;
}

interface JupyterKernelInterfaceSpawnOpts {
  env: { [key: string]: string }; // environment variables
}

export interface JupyterKernelInterface extends EventEmitterInterface {
  sockets?: JupyterSockets;
  name: string | undefined; // name = undefined implies it is not spawnable.  It's a notebook with no actual jupyter kernel process.
  store: any;
  readonly identity: string;
  failedError: string;
  getStatus(): { kernel_state: KernelState; backend_state: BackendState };
  isClosed(): boolean;
  get_state(): string;
  signal(signal: string): void;
  close(): void;
  spawn(opts?: JupyterKernelInterfaceSpawnOpts): Promise<void>;
  execute_code(opts: ExecOpts): CodeExecutionEmitterInterface;
  cancel_execute(id: string): void;
  execute_code_now(opts: ExecOpts): Promise<object[]>;
  complete(opts: { code: any; cursor_pos: any });
  introspect(opts: {
    code: any;
    cursor_pos: any;
    detail_level: any;
  }): Promise<any>;
  kernel_info(): Promise<KernelInfo>;
  more_output(id: string): any[];
  nbconvert(args: string[], timeout?: number): Promise<void>;
  sendCommMessageToKernel(msg: {
    msg_id: string;
    comm_id: string;
    target_name: string;
    data: any;
    buffers?: any[];
    buffers64?: any[];
  }): void;
  getConnectionFile(): string | undefined;

  _execute_code_queue: CodeExecutionEmitterInterface[];
  clear_execute_code_queue(): void;
  _process_execute_code_queue(): Promise<void>;

  chdir(path: string): Promise<void>;
  ensureRunning(): Promise<void>;

  ipywidgetsGetBuffer(
    model_id: string,
    buffer_path: string | string[],
  ): Buffer | undefined;
}
