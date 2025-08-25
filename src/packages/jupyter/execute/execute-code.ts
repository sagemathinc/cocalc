/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Send code to a kernel to be evaluated, then wait for
the results and gather them together.
*/

import { callback, delay } from "awaiting";
import { EventEmitter } from "events";
import { VERSION } from "@cocalc/jupyter/kernel/version";
import type { JupyterKernelInterface as JupyterKernel } from "@cocalc/jupyter/types/project-interface";
import type { MessageType } from "@cocalc/jupyter/zmq/types";
import { copy_with, deep_copy, uuid } from "@cocalc/util/misc";
import type {
  CodeExecutionEmitterInterface,
  OutputMessage,
  ExecOpts,
  StdinFunction,
} from "@cocalc/jupyter/types/project-interface";
import { getLogger } from "@cocalc/backend/logger";
import { EventIterator } from "@cocalc/util/event-iterator";
import { once } from "@cocalc/util/async-utils";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import type { Message } from "@cocalc/jupyter/zmq/message";

const log = getLogger("jupyter:execute-code");

type State = "init" | "running" | "done" | "closed";

export class CodeExecutionEmitter
  extends EventEmitter
  implements CodeExecutionEmitterInterface
{
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
  private _message: any;
  private _go_cb: Function | undefined = undefined;
  private timeout_ms?: number;
  private timer?: any;
  private killing: string = "";
  private _iter?: EventIterator<OutputMessage>;

  constructor(kernel: JupyterKernel, opts: ExecOpts) {
    super();
    this.kernel = kernel;
    this.code = opts.code;
    this.id = opts.id;
    this.stdin = opts.stdin;
    this.halt_on_error = !!opts.halt_on_error;
    this.timeout_ms = opts.timeout_ms;
    this._message = {
      parent_header: {},
      metadata: {},
      channel: "shell",
      header: {
        msg_id: `execute_${uuid()}`,
        username: "",
        session: "",
        msg_type: "execute_request" as MessageType,
        version: VERSION,
        date: new Date().toISOString(),
      },
      content: {
        code: this.code,
        silent: false,
        store_history: true, // so execution_count is updated.
        user_expressions: {},
        allow_stdin: this.stdin != null,
      },
    };
  }

  // async interface:
  iter = (): EventIterator<OutputMessage> => {
    if (this.state == "closed") {
      throw Error("closed");
    }
    if (this._iter == null) {
      this._iter = new EventIterator<OutputMessage>(this, "output", {
        map: (args) => {
          if (args[0]?.done) {
            setTimeout(() => this._iter?.close(), 1);
          }
          return args[0];
        },
      });
    }
    return this._iter;
  };

  waitUntilDone = reuseInFlight(async () => {
    try {
      await once(this, "done");
    } catch {
      // it throws on close, but that's also "done".
    }
  });

  private setState = (state: State) => {
    this.state = state;
    this.emit(state);
  };

  // Emits a valid result, which is
  //    https://jupyter-client.readthedocs.io/en/stable/messaging.html#python-api
  // Or an array of those when this.all is true
  emit_output = (output: OutputMessage): void => {
    this.emit("output", output);
    if (output["done"]) {
      this.setState("done");
    }
  };

  // Call this to inform anybody listening that we've canceled
  // this execution, and will NOT be doing it ever, and it
  // was explicitly canceled.
  cancel = (): void => {
    this.emit("canceled");
    this.setState("done");
    this._iter?.close();
  };

  close = (): void => {
    if (this.state == "closed") {
      return;
    }
    this.setState("closed");
    if (this.timer != null) {
      clearTimeout(this.timer);
      delete this.timer;
    }
    this._iter?.close();
    delete this._iter;
    // @ts-ignore
    delete this._go_cb;
    this.emit("closed");
    this.removeAllListeners();
  };

  throw_error = (err): void => {
    if (this._iter != null) {
      // using the iter, so we can use that to report the error
      this._iter.throw(err);
    } else {
      // no iter so make error known via error event
      this.emit("error", err);
    }
    this.close();
  };

  private handleStdin = async (mesg: Message): Promise<void> => {
    if (!this.stdin) {
      throw Error("BUG -- stdin handling not supported");
    }
    log.silly("handleStdin: STDIN kernel --> server: ", mesg);
    if (mesg.parent_header.msg_id !== this._message.header.msg_id) {
      log.warn(
        "handleStdin: STDIN msg_id mismatch:",
        mesg.parent_header.msg_id,
        this._message.header.msg_id,
      );
      return;
    }

    let response;
    try {
      response = await this.stdin(
        mesg.content.prompt ? mesg.content.prompt : "",
        !!mesg.content.password,
      );
    } catch (err) {
      response = `ERROR -- ${err}`;
    }
    log.silly("handleStdin: STDIN client --> server", response);
    const m = {
      channel: "stdin",
      parent_header: this._message.header,
      metadata: {},
      header: {
        msg_id: uuid(), // this._message.header.msg_id
        username: "",
        session: "",
        msg_type: "input_reply" as MessageType,
        version: VERSION,
        date: new Date().toISOString(),
      },
      content: {
        value: response,
      },
    };
    log.silly("handleStdin: STDIN server --> kernel:", m);
    this.kernel.sockets?.send(m);
  };

  private handleShell = (mesg: Message): void => {
    if (mesg.parent_header.msg_id !== this._message.header.msg_id) {
      log.silly(
        `handleShell: msg_id mismatch: ${mesg.parent_header.msg_id} != ${this._message.header.msg_id}`,
      );
      return;
    }
    log.silly("handleShell: got SHELL message -- ", mesg);

    if (mesg.content?.status == "ok") {
      this._push_mesg(mesg);
      this.set_shell_done(true);
    } else {
      log.warn(`handleShell: status != ok: ${mesg.content?.status}`);
      // NOTE: I'm adding support for "abort" status, since I was just reading
      // the kernel docs and it exists but is deprecated.  Some old kernels
      // might use it and we should thus properly support it:
      // https://jupyter-client.readthedocs.io/en/stable/messaging.html#request-reply
      //
      // 2023-05-11: this was conditional on mesg.content?.status == "error" or == "abort"
      //             but in reality, there was also "aborted". Hence this as an catch-all else.
      if (this.halt_on_error) {
        this.kernel.clear_execute_code_queue();
      }
      this.set_shell_done(true);
    }
  };

  private set_shell_done = (value: boolean): void => {
    this.shell_done = value;
    if (this.iopub_done && this.shell_done) {
      this._finish();
    }
  };

  private set_iopub_done = (value: boolean): void => {
    this.iopub_done = value;
    if (this.iopub_done && this.shell_done) {
      this._finish();
    }
  };

  handleIOPub = (mesg: Message): void => {
    if (mesg.parent_header.msg_id !== this._message.header.msg_id) {
      // iopub message for a different execute request so ignore it.
      return;
    }
    // these can be huge -- do not uncomment except for low level debugging!
    // log.silly("handleIOPub: got IOPUB message -- ", mesg);

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
      !!this.killing || mesg.content?.execution_state == "idle",
    );
  };

  // Called if the kernel is closed for some reason, e.g., crashing.
  private handleClosed = (): void => {
    log.debug("CodeExecutionEmitter.handleClosed: kernel closed");
    this.killing = "kernel crashed";
    this._finish();
  };

  private _finish = (): void => {
    if (this.state == "closed") {
      return;
    }
    this.kernel.removeListener("iopub", this.handleIOPub);
    if (this.stdin != null) {
      this.kernel.removeListener("stdin", this.handleStdin);
    }
    this.kernel.removeListener("shell", this.handleShell);
    if (this.kernel._execute_code_queue != null) {
      this.kernel._execute_code_queue.shift(); // finished
      this.kernel._process_execute_code_queue(); // start next exec
    }
    this.kernel.removeListener("closed", this.handleClosed);
    this.kernel.removeListener("failed", this.handleClosed);
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
  };

  _push_mesg = (mesg): void => {
    // TODO: mesg isn't a normal javascript object;
    // it's **silently** immutable, which
    // is pretty annoying for our use. For now, we
    // just copy it, which is a waste.
    const header = mesg.header;
    mesg = copy_with(mesg, ["metadata", "content", "buffers", "done"]);
    mesg = deep_copy(mesg);
    if (header !== undefined) {
      mesg.msg_type = header.msg_type;
    }
    this.emit_output(mesg);
  };

  go = async (): Promise<void> => {
    await callback(this._go);
  };

  private _go = (cb: Function): void => {
    if (this.state != "init") {
      cb("may only run once");
      return;
    }
    this.state = "running";
    log.silly("_execute_code", this.code);
    const kernelState = this.kernel.get_state();
    if (kernelState == "closed" || kernelState == "failed") {
      log.silly("_execute_code", "kernel.get_state() is ", kernelState);
      this.killing = kernelState;
      this._finish();
      cb(kernelState);
      return;
    }

    this._go_cb = cb; // this._finish will call this.

    if (this.stdin != null) {
      this.kernel.on("stdin", this.handleStdin);
    }
    this.kernel.on("shell", this.handleShell);
    this.kernel.on("iopub", this.handleIOPub);

    this.kernel.once("closed", this.handleClosed);
    this.kernel.once("failed", this.handleClosed);

    if (this.timeout_ms) {
      // setup a timeout at which point things will get killed if they don't finish
      this.timer = setTimeout(this.timeout, this.timeout_ms);
    }

    log.debug("_execute_code: send the message to get things rolling");
    if (this.kernel.sockets == null) {
      throw Error("bug -- sockets must be defined");
    }
    this.kernel.sockets.send(this._message);
  };

  private timeout = async (): Promise<void> => {
    if (this.state == "closed") {
      log.debug(
        "CodeExecutionEmitter.timeout: already finished, so nothing to worry about",
      );
      return;
    }
    this.killing =
      "Timeout Error: execution time limit = " +
      Math.round((this.timeout_ms ?? 0) / 1000) +
      " seconds";
    let tries = 3;
    let d = 1000;
    while (this.state != ("closed" as State) && tries > 0) {
      log.debug(
        "CodeExecutionEmitter.timeout: code still running, so try to interrupt it",
      );
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
      log.debug(
        "CodeExecutionEmitter.timeout: now try SIGKILL, which should kill things for sure.",
      );
      this.kernel.signal("SIGKILL");
      this._finish();
    }
  };
}
