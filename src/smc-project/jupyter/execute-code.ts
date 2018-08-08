/*
Send code to a kernel to be evaluated, then wait for
the results and gather them together.

TODO: for easy testing/debugging, at an "async run() : Messages[]" method.
*/

import { callback } from "awaiting";
import { EventEmitter } from "events";
import { JupyterKernel, VERSION } from "./jupyter";

import {
  uuid,
  trunc,
  deep_copy,
  copy_with
} from "../smc-webapp/frame-editors/generic/misc";

import {
  CodeExecutionEmitterInterface,
  ExecOpts,
  StdinFunction,
  MesgHandler,
  Message
} from "../smc-webapp/jupyter/project-interface";

export class CodeExecutionEmitter extends EventEmitter
  implements CodeExecutionEmitterInterface {
  readonly kernel: JupyterKernel;
  readonly code: string;
  readonly id?: string;
  readonly stdin?: StdinFunction;
  readonly halt_on_error: boolean;
  private state : string = 'init';
  private all_output: object[] = [];

  constructor(kernel: JupyterKernel, opts: ExecOpts) {
    super();
    this.kernel = kernel;
    this.code = opts.code;
    this.id = opts.id;
    this.stdin = opts.stdin;
    this.halt_on_error = !!opts.halt_on_error;

    this._go = this._go.bind(this);
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
    this.state = 'closed';
    this.emit("closed");
    this.removeAllListeners();
  }

  throw_error(err): void {
    this.emit("error", err);
    this.close();
  }

  async go(): Promise<object[]> {
    await callback(this._go);
    return this.all_output;
  }

  _go(cb: Function): void {
    if (this.state != 'init') {
      cb("may only run once");
      return;
    }
    this.state = 'running';
    let kernel = this.kernel;
    const dbg = kernel.dbg(`_execute_code('${trunc(this.code, 15)}')`);
    dbg(`code='${this.code}'`);
    if (kernel.get_state() === "closed") {
      this.close();
      cb("closed");
      return;
    }

    const message = {
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

    let shell_done: boolean = false;
    let iopub_done: boolean = false;

    const push_mesg = mesg => {
      // TODO: mesg isn't a normal javascript object;
      // it's **silently** immutable, which
      // is pretty annoying for our use. For now, we
      // just copy it, which is a waste.
      // dbg("push_mesg", mesg);
      mesg = copy_with(mesg, ["metadata", "content", "buffers", "done"]);
      // dbg("push_mesg after copy_with", mesg);
      mesg = deep_copy(mesg);
      // dbg("push_mesg after deep copy", mesg);
      if (mesg.header !== undefined) {
        mesg.msg_type = mesg.header.msg_type;
      }
      this.emit_output(mesg);
    };

    let f: MesgHandler, g: MesgHandler, h: MesgHandler;
    if (this.stdin != null) {
      g = mesg => {
        dbg(`STDIN kernel --> server: ${JSON.stringify(mesg)}`);
        if (mesg.parent_header.msg_id !== message.header.msg_id) {
          dbg(
            `STDIN msg_id mismatch: ${mesg.parent_header.msg_id}!=${
              message.header.msg_id
            }`
          );
          return;
        }

        if (this.stdin == null) {
          // can't happen -- this is to satisfy the compiler.
          return;
        }

        this.stdin(mesg.content, (err, response) => {
          dbg(`STDIN client --> server ${err}, ${JSON.stringify(response)}`);
          if (err) {
            response = `ERROR -- ${err}`;
          }
          const m = {
            parent_header: message.header,
            header: {
              msg_id: uuid(), // message.header.msg_id
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
          kernel._channels.stdin.next(m);
        });
      };

      kernel.on("stdin", g);
    }

    h = mesg => {
      if (mesg.parent_header.msg_id !== message.header.msg_id) {
        return;
      }
      dbg(`got SHELL message -- ${JSON.stringify(mesg)}`);
      if (
        (mesg.content != null ? mesg.content.status : undefined) === "error"
      ) {
        if (this.halt_on_error) {
          kernel._clear_execute_code_queue();
        }
        // just bail; actual error would have been reported on iopub channel, hopefully.
        finish();
      } else {
        push_mesg(mesg);
        shell_done = true;
        if (iopub_done && shell_done) {
          finish();
        }
      }
    };

    kernel.on("shell", h);

    f = mesg => {
      if (mesg.parent_header.msg_id !== message.header.msg_id) {
        return;
      }
      dbg(`got IOPUB message -- ${JSON.stringify(mesg)}`);

      iopub_done =
        (mesg.content != null ? mesg.content.execution_state : undefined) ===
        "idle";

      push_mesg(mesg);

      if (iopub_done && shell_done) {
        return typeof finish === "function" ? finish() : undefined;
      }
    };

    kernel.on("iopub", f);

    let done: boolean = false;
    const finish = () => {
      if (done) return;
      done = true;
      if (f != null) {
        kernel.removeListener("iopub", f);
      }
      if (g != null) {
        kernel.removeListener("stdin", g);
      }
      if (h != null) {
        kernel.removeListener("shell", h);
      }
      kernel._execute_code_queue.shift(); // finished
      kernel._process_execute_code_queue(); // start next exec
      push_mesg({ done: true });
      this.close();
      cb();
    };

    dbg("send the message");
    kernel._channels.shell.next(message);
  }
}
