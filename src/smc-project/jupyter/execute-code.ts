/*
Send code to a kernel to be evaluated, then wait for
the results and gather them together.

TODO: for easy testing/debugging, at an "async run() : Messages[]" method.
*/

import { callback } from "awaiting";
import { EventEmitter } from "events";
import { JupyterKernel, VERSION } from "./jupyter";

import { uuid, trunc, deep_copy, copy_with } from "../smc-util/misc2";

import {
  CodeExecutionEmitterInterface,
  ExecOpts,
  StdinFunction
} from "../smc-webapp/jupyter/project-interface";

export class CodeExecutionEmitter extends EventEmitter
  implements CodeExecutionEmitterInterface {
  readonly kernel: JupyterKernel;
  readonly code: string;
  readonly id?: string;
  readonly stdin?: StdinFunction;
  readonly halt_on_error: boolean;
  private iopub_done: boolean = false;
  private shell_done: boolean = false;
  private state: string = "init";
  private all_output: object[] = [];
  private _message: any;
  private _go_cb: Function;

  constructor(kernel: JupyterKernel, opts: ExecOpts) {
    super();
    this.kernel = kernel;
    this.code = opts.code;
    this.id = opts.id;
    this.stdin = opts.stdin;
    this.halt_on_error = !!opts.halt_on_error;
    this._message = {
      header: {
        msg_id: `execute_${uuid()}`,
        username: "",
        session: "",
        msg_type: "execute_request",
        version: VERSION
      },
      content: {
        code: this.code,
        silent: false,
        store_history: true, // so execution_count is updated.
        user_expressions: {},
        allow_stdin: this.stdin != null
      }
    };

    this._go = this._go.bind(this);
    this._handle_stdin = this._handle_stdin.bind(this);
    this._handle_shell = this._handle_shell.bind(this);
    this._handle_iopub = this._handle_iopub.bind(this);
    this._push_mesg = this._push_mesg.bind(this);
    this._finish = this._finish.bind(this);
  }

  // Emits a valid result
  // result is https://jupyter-client.readthedocs.io/en/stable/messaging.html#python-api
  // Or an array of those when this.all is true
  emit_output(output: object): void {
    this.all_output.push(output);
    this.emit("output", output);
  }

  // Call this to inform anybody listening that we've cancelled
  // this execution, and will NOT be doing it ever, and it
  // was explicitly cancelled.
  cancel(): void {
    this.emit("canceled");
  }

  close(): void {
    if (this.state == "closed") return;
    this.state = "closed";
    this.emit("closed");
    this.removeAllListeners();
  }

  throw_error(err): void {
    this.emit("error", err);
    this.close();
  }

  async _handle_stdin(mesg: any): Promise<void> {
    const dbg = this.kernel.dbg("_handle_stdin");
    if (!this.stdin) {
      throw Error("BUG -- stdin handling not supported");
    }
    dbg(`STDIN kernel --> server: ${JSON.stringify(mesg)}`);
    if (mesg.parent_header.msg_id !== this._message.header.msg_id) {
      dbg(
        `STDIN msg_id mismatch: ${mesg.parent_header.msg_id}!=${this._message.header.msg_id}`
      );
      return;
    }

    let response;
    try {
      response = await this.stdin(
        mesg.content.prompt ? mesg.content.prompt : "",
        !!mesg.content.password
      );
    } catch (err) {
      response = `ERROR -- ${err}`;
    }
    dbg(`STDIN client --> server ${JSON.stringify(response)}`);
    const m = {
      parent_header: this._message.header,
      header: {
        msg_id: uuid(), // this._message.header.msg_id
        username: "",
        session: "",
        msg_type: "input_reply",
        version: VERSION
      },
      content: {
        value: response
      }
    };
    dbg(`STDIN server --> kernel: ${JSON.stringify(m)}`);
    this.kernel._channels.stdin.next(m);
  }

  _handle_shell(mesg: any): void {
    if (mesg.parent_header.msg_id !== this._message.header.msg_id) {
      return;
    }
    const dbg = this.kernel.dbg("_handle_shell");
    dbg(`got SHELL message -- ${JSON.stringify(mesg)}`);
    if ((mesg.content != null ? mesg.content.status : undefined) === "error") {
      if (this.halt_on_error) {
        this.kernel._clear_execute_code_queue();
      }
      // just bail; actual error would have been reported on iopub channel, hopefully.
      this._finish();
    } else {
      this._push_mesg(mesg);
      this.shell_done = true;
      if (this.iopub_done && this.shell_done) {
        this._finish();
      }
    }
  }

  _handle_iopub(mesg: any): void {
    if (mesg.parent_header.msg_id !== this._message.header.msg_id) {
      return;
    }
    const dbg = this.kernel.dbg("_handle_iopub");
    dbg(`got IOPUB message -- ${JSON.stringify(mesg)}`);

    this.iopub_done =
      (mesg.content != null ? mesg.content.execution_state : undefined) ===
      "idle";

    if (
      (mesg.content != null ? mesg.content.comm_id : undefined) !== undefined
    ) {
      // A comm message that is a result of execution of this code.
      // IGNORE here -- all comm messages are handles at a higher
      // level in jupyter.ts.  Also, this case should never happen, since
      // we do not emit an event from jupyter.ts in this case anyways.
    } else {
      // A normal output message.
      this._push_mesg(mesg);
    }

    if (this.iopub_done && this.shell_done) {
      this._finish();
    }
  }

  _finish(): void {
    if (this.state === "closed") {
      return;
    }
    this.kernel.removeListener("iopub", this._handle_iopub);
    if (this.stdin != null) {
      this.kernel.removeListener("stdin", this._handle_stdin);
    }
    this.kernel.removeListener("shell", this._handle_shell);
    this.kernel._execute_code_queue.shift(); // finished
    this.kernel._process_execute_code_queue(); // start next exec
    this._push_mesg({ done: true });
    this.close();
    if (this._go_cb !== undefined) {
      this._go_cb();
    }
  }

  _push_mesg(mesg): void {
    // TODO: mesg isn't a normal javascript object;
    // it's **silently** immutable, which
    // is pretty annoying for our use. For now, we
    // just copy it, which is a waste.
    // const dbg = this.kernel.dbg(`_execute_code('${trunc(this.code, 15)}')`);
    // dbg("push_mesg", mesg);
    const header = mesg.header;
    mesg = copy_with(mesg, ["metadata", "content", "buffers", "done"]);
    mesg = deep_copy(mesg);
    if (header !== undefined) {
      mesg.msg_type = header.msg_type;
    }
    // dbg("push_mesg after copying msg_type", mesg);
    this.emit_output(mesg);
  }

  async go(): Promise<object[]> {
    await callback(this._go);
    return this.all_output;
  }

  _go(cb: Function): void {
    if (this.state != "init") {
      cb("may only run once");
      return;
    }
    this.state = "running";
    const dbg = this.kernel.dbg(`_execute_code('${trunc(this.code, 15)}')`);
    dbg(`code='${this.code}'`);
    if (this.kernel.get_state() === "closed") {
      this.close();
      cb("closed");
      return;
    }

    this._go_cb = cb; // this._finish will call this.

    if (this.stdin != null) {
      this.kernel.on("stdin", this._handle_stdin);
    }
    this.kernel.on("shell", this._handle_shell);
    this.kernel.on("iopub", this._handle_iopub);

    dbg("send the message to get things rolling");
    this.kernel._channels.shell.next(this._message);
  }
}
