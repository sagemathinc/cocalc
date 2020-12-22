/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Send code to a kernel to be evaluated, then wait for
the results and gather them together.

TODO: for easy testing/debugging, at an "async run() : Messages[]" method.
*/

import { callback, delay } from "awaiting";
import { EventEmitter } from "events";
import { JupyterKernel, VERSION } from "./jupyter";

import {
  bind_methods,
  copy_with,
  deep_copy,
  uuid,
  trunc,
} from "../smc-util/misc";

import {
  CodeExecutionEmitterInterface,
  ExecOpts,
  StdinFunction,
} from "../smc-webapp/jupyter/project-interface";

type State = "init" | "closed" | "running";

export class CodeExecutionEmitter
  extends EventEmitter
  implements CodeExecutionEmitterInterface {
  readonly kernel: JupyterKernel;
  readonly code: string;
  readonly id?: string;
  readonly stdin?: StdinFunction;
  readonly halt_on_error: boolean;
  // DO NOT set iopub_done or shell_done directly; instead
  // set them using the function set_shell_done and set_iopub_done.
  // This ensures that we call _finish when both vars have been set.
  private iopub_done: boolean = false;
  private shell_done: boolean = false;
  private state: State = "init";
  private all_output: object[] = [];
  private _message: any;
  private _go_cb: Function | undefined = undefined;
  private timeout_ms?: number;
  private timer?: any;
  private killing: string = "";

  constructor(kernel: JupyterKernel, opts: ExecOpts) {
    super();
    this.kernel = kernel;
    this.code = opts.code;
    this.id = opts.id;
    this.stdin = opts.stdin;
    this.halt_on_error = !!opts.halt_on_error;
    this.timeout_ms = opts.timeout_ms;
    this._message = {
      header: {
        msg_id: `execute_${uuid()}`,
        username: "",
        session: "",
        msg_type: "execute_request",
        version: VERSION,
      },
      content: {
        code: this.code,
        silent: false,
        store_history: true, // so execution_count is updated.
        user_expressions: {},
        allow_stdin: this.stdin != null,
      },
    };

    bind_methods(this);
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
    if (this.timer != null) {
      clearTimeout(this.timer);
      delete this.timer;
    }
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
        version: VERSION,
      },
      content: {
        value: response,
      },
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
    if (mesg.content?.status == "error" || mesg.content?.status == "abort") {
      // NOTE: I'm adding support for "abort" status, since I was just reading
      // the kernel docs and it exists but is deprecated.  Some old kernels
      // might use it and we should thus properly support it:
      // https://jupyter-client.readthedocs.io/en/stable/messaging.html#request-reply
      if (this.halt_on_error) {
        this.kernel.clear_execute_code_queue();
      }
      this.set_shell_done(true);
    } else if (mesg.content?.status == "ok") {
      this._push_mesg(mesg);
      this.set_shell_done(true);
    }
  }

  private set_shell_done(value: boolean): void {
    this.shell_done = value;
    if (this.iopub_done && this.shell_done) {
      this._finish();
    }
  }

  private set_iopub_done(value: boolean): void {
    this.iopub_done = value;
    if (this.iopub_done && this.shell_done) {
      this._finish();
    }
  }

  _handle_iopub(mesg: any): void {
    if (mesg.parent_header.msg_id !== this._message.header.msg_id) {
      // iopub message for a different execute request so ignore it.
      return;
    }
    const dbg = this.kernel.dbg("_handle_iopub");
    dbg(`got IOPUB message -- ${JSON.stringify(mesg)}`);

    if (mesg.content?.comm_id != null) {
      // A comm message that is a result of execution of this code.
      // IGNORE here -- all comm messages are handles at a higher
      // level in jupyter.ts.  Also, this case should never happen, since
      // we do not emit an event from jupyter.ts in this case anyways.
    } else {
      // A normal output message.
      this._push_mesg(mesg);
    }

    this.set_iopub_done(
      !!this.killing || mesg.content?.execution_state == "idle"
    );
  }

  // Called if the kernel is closed for some reason, e.g., crashing.
  private handle_closed(): void {
    const dbg = this.kernel.dbg("CodeExecutionEmitter.handle_closed");
    dbg("kernel closed");
    this.killing = "kernel crashed";
    this._finish();
  }

  _finish(): void {
    if (this.state == "closed") {
      return;
    }
    this.kernel.removeListener("iopub", this._handle_iopub);
    if (this.stdin != null) {
      this.kernel.removeListener("stdin", this._handle_stdin);
    }
    this.kernel.removeListener("shell", this._handle_shell);
    if (this.kernel._execute_code_queue != null) {
      this.kernel._execute_code_queue.shift(); // finished
      this.kernel._process_execute_code_queue(); // start next exec
    }
    this.kernel.removeListener("close", this.handle_closed);
    this._push_mesg({ done: true });
    this.close();

    // Finally call the callback that was setup in this._go.
    // This is what makes it possible to await on the entire
    // execution.  Also it is important to explicitly
    // signal an error if we had to kill execution due
    // to hitting a timeout, since the kernel may or may
    // not have randomly done so itself in output.
    this._go_cb?.(this.killing);
    this._go_cb = undefined;
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

    this.kernel.on("closed", this.handle_closed);

    if (this.timeout_ms) {
      // setup a timeout at which point things will get killed if they don't finish
      this.timer = setTimeout(this.timeout, this.timeout_ms);
    }
  }

  private async timeout(): Promise<void> {
    const dbg = this.kernel.dbg("CodeExecutionEmitter.timeout");
    if (this.state == "closed") {
      dbg("already finished, so nothing to worry about");
      return;
    }
    this.killing =
      "Timeout Error: execution time limit = " +
      Math.round((this.timeout_ms ?? 0) / 1000) +
      " seconds";
    let tries = 3;
    let d = 1000;
    while (this.state != ("closed" as State) && tries > 0) {
      dbg("code still running, so try to interrupt it");
      // Code still running but timeout reached.
      // Keep sending interrupt signal, which will hopefully do something to
      // stop running code (there is no guarantee, of course).  We
      // try a few times...
      this.kernel.signal("SIGINT");
      await delay(d);
      d *= 1.3;
      tries -= 1;
    }
    if (this.state != ("closed" as State)) {
      dbg("now try SIGKILL, which should kill things for sure.");
      this.kernel.signal("SIGKILL");
      this._finish();
    }
  }
}
