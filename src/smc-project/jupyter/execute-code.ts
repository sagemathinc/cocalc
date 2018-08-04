/*
Send code to a kernel to be evaluated, then wait for
the results and gather them together.

TODO: for easy testing/debugging, at an "async run() : Messages[]" method.
*/

import { EventEmirror } from "events";
import { Kernel } from "./jupyter";

import {
  uuid,
  trunc,
  deep_copy,
  copy_with
} from "smc-webapp/frame-tree/generic/misc";

type StdinFunction = (options: object, cb: Function) => void;

type MesgHandler = (mesg: object) => void;

class CodeExecutionEmitter extends EventEmitter {
  readonly kernel: Kernel;
  readonly code: string;
  readonly id?: string;
  readonly all: boolean;
  readonly stdin?: StdinFunction;
  readonly halt_on_error: boolean;

  constructor(opts: {
    kernel: Kernel;
    code: string;
    id?: string;
    all?: boolean;
    stdin?: StdinFunction;
    halt_on_error: boolean;
  }) {
    super();
    this.kernel = opts.kernel;
    this.code = opts.code;
    this.id = opts.id;
    this.all = !!opts.all;
    this.stdin = opts.stdin;
    this.halt_on_error = !!opts.halt_on_error;
  }

  // Returns a valid result
  // result is https://jupyter-client.readthedocs.io/en/stable/messaging.html#python-api
  // Or an array of those when this.all is true
  private emit_result(result: object): void {
    this.emit("result", result);
  }

  request_stdin(mesg, cb: (err, response: string) => void) {
    this.emit("stdin_request", mesg, cb);
  }

  // Call this to inform anybody listening that we've cancelled
  // this execution, and will NOT be doing it ever, and it
  // was explicitly cancelled.
  cancel() : void {
    this.emit("canceled");
  }

  close() {
    this.emit("closed");
  }

  throw_error(err) {
    this.emit("error", err);
  }

  go(): void {
    let kernel = this.kernel;
    const dbg = kernel.dbg(`_execute_code('${trunc(this.code, 15)}')`);
    dbg(`code='${this.code}', all=${this.all}`);
    if (kernel._state === "closed") {
      this.close();
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

    const all_mesgs: any[] = [];

    let shell_done: boolean = false;
    let iopub_done: boolean = false;

    const push_mesg = mesg => {
      // TODO: mesg isn't a normal javascript object;
      // it's **silently** immutable, which
      // is pretty annoying for our use. For now, we
      // just copy it, which is a waste.
      mesg = copy_with(mesg, ["metadata", "content", "buffers", "done"]);
      mesg = deep_copy(mesg);
      if (mesg.header != null) {
        mesg.msg_type = mesg.header.msg_type;
      }
      if (this.all) {
        all_mesgs.push(mesg);
      } else {
        this.emit_result(mesg);
      }
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

        this.request_stdin(mesg.content, (err, response) => {
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
      if (this.all) {
        this.emit_result(all_mesgs);
      }
    };

    dbg("send the message");
    kernel._channels.shell.next(message);
  }
}
