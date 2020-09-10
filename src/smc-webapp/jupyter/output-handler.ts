/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Class that handles output messages generated for evaluation of code
for a particular cell.

WARNING: For efficiency reasons (involving syncdb patch sizes),
outputs is a map from the (string representations of) the numbers
from 0 to n-1, where there are n messages.  So watch out.

OutputHandler emits two events:

   - 'change' -- (save),  called when we change cell; if save=true, recommend
                 broadcasting this change to other users ASAP.

   - 'done'  -- emited once when finished; after this, everything is cleaned up

   - 'more_output'  -- If we exceed the message limit, emit more_output  (mesg, mesg_length)
                          with extra messages.

   - 'process'  -- Gets called on any incoming message; it may
                   **mutate** the message, e.g., removing images uses this.

*/

import { callback } from "awaiting";
import { EventEmitter } from "events";

const misc = require("smc-util/misc");
const { defaults, required } = misc;

const now = () => misc.server_time() - 0;

export class OutputHandler extends EventEmitter {
  private _opts: any;
  private _n: number;
  private _clear_before_next_output: boolean;
  private _output_length: number;
  private _in_more_output_mode: any;
  private _state: any;
  private _stdin_cb: any;

  constructor(opts: any) {
    super();
    this._opts = defaults(opts, {
      cell: required, // object; the cell whose output (etc.) will get mutated
      max_output_length: undefined, // If given, used to truncate, discard output messages; extra
      // messages are saved and made available.
      report_started_ms: undefined, // If no messages for this many ms, then we update via set to indicate
      // that cell is being run.
      dbg: undefined,
    });
    const { cell } = this._opts;
    cell.output = null;
    cell.exec_count = null;
    cell.state = "run";
    cell.start = null;
    cell.end = null;
    // Internal state
    this._n = 0;
    this._clear_before_next_output = false;
    this._output_length = 0;
    this._in_more_output_mode = false;
    this._state = "ready";
    // Report that computation started if there is no output soon.
    if (this._opts.report_started_ms != null) {
      setTimeout(this._report_started, this._opts.report_started_ms);
    }

    this.stdin = this.stdin.bind(this);
  }

  close = (): void => {
    this._state = "closed";
    this.emit("done");
    this.removeAllListeners();
  };

  _clear_output = (save?: any): void => {
    if (this._state === "closed") {
      return;
    }
    this._clear_before_next_output = false;
    // clear output message -- we delete all the outputs
    // reset the counter n, save, and are done.
    // IMPORTANT: In Jupyter the clear_output message and everything
    // before it is NOT saved in the notebook output itself
    // (like in Sage worksheets).
    this._opts.cell.output = null;
    this._n = 0;
    this._output_length = 0;
    this.emit("change", save);
  };

  _report_started = (): void => {
    if (this._state == "closed" || this._n > 0) {
      // do nothing -- already getting output or done.
      return;
    }
    this.emit("change", true);
  };

  // Call when computation starts
  start = () => {
    if (this._state === "closed") {
      return;
    }
    this._opts.cell.start = (new Date() as any) - 0;
    this._opts.cell.state = "busy";
    this.emit("change", true);
  };

  // Call error if an error occurs.  An appropriate error message is generated.
  // Computation is considered done.
  error = (err: any): void => {
    if (err === "closed") {
      // See https://github.com/sagemathinc/cocalc/issues/2388
      this.message({
        data: {
          "text/markdown":
            "<font color='red'>**Jupyter Kernel terminated:**</font> This might be caused by running out of memory or hitting a bug in some library (e.g., forking too many processes, trying to access invalid memory, etc.). Consider restarting or upgrading your project or running the relevant code directly in a terminal to track down the cause, as [explained here](https://github.com/sagemathinc/cocalc/wiki/KernelTerminated).",
        },
      });
    } else {
      this.message({
        text: `${err}`,
        name: "stderr",
      });
    }
    this.done();
  };

  // Call done exactly once when done
  done = (): void => {
    if (this._state === "closed") {
      return;
    }
    this._opts.cell.state = "done";
    if (this._opts.cell.start == null) {
      this._opts.cell.start = now();
    }
    this._opts.cell.end = now();
    this.emit("change", true);
    this.close();
  };

  // Handle clear
  clear = (wait: any): void => {
    if (wait) {
      // wait until next output before clearing.
      this._clear_before_next_output = true;
      return;
    }
    this._clear_output();
  };

  _clean_mesg = (mesg: any): void => {
    delete mesg.execution_state;
    delete mesg.code;
    delete mesg.status;
    delete mesg.source;
    for (const k in mesg) {
      const v = mesg[k];
      if (misc.is_object(v) && misc.len(v) === 0) {
        delete mesg[k];
      }
    }
  };

  private _push_mesg = (mesg: any, save = true): void => {
    if (this._state === "closed") {
      return;
    }
    if (this._opts.cell.output === null) {
      this._opts.cell.output = {};
    }
    this._opts.cell.output[`${this._n}`] = mesg;
    this._n += 1;
    this.emit("change", save);
  };

  set_input = (input: any, save = true): void => {
    if (this._state === "closed") {
      return;
    }
    this._opts.cell.input = input;
    this.emit("change", save);
  };

  // Process incoming messages.  This may mutate mesg.
  message = (mesg: any): void => {
    let has_exec_count: any;
    if (this._state === "closed") {
      return;
    }

    if (this._opts.cell.end) {
      // ignore any messages once we're done.
      return;
    }

    // record execution_count, if there.
    if (mesg.execution_count != null) {
      has_exec_count = true;
      this._opts.cell.exec_count = mesg.execution_count;
      delete mesg.execution_count;
    } else {
      has_exec_count = false;
    }

    // delete useless fields
    this._clean_mesg(mesg);

    if (misc.len(mesg) === 0) {
      // don't even bother saving this message; nothing useful here.
      return;
    }

    if (has_exec_count) {
      // message that has an execution count
      mesg.exec_count = this._opts.cell.exec_count;
    }

    // hook to process message (e.g., this may mutate mesg,
    // e.g., to remove big images)
    this.emit("process", mesg);

    if (this._clear_before_next_output) {
      this._clear_output(false);
    }

    if (!this._opts.max_output_length) {
      this._push_mesg(mesg);
      return;
    }

    // worry about length
    const s = JSON.stringify(mesg);
    const mesg_length = (s && s.length) || 0;
    this._output_length += mesg_length;

    if (this._output_length <= this._opts.max_output_length) {
      this._push_mesg(mesg);
      return;
    }

    // Check if we have entered the mode were output gets put in
    // the set_more_output buffer.
    if (!this._in_more_output_mode) {
      this._push_mesg({ more_output: true });
      this._in_more_output_mode = true;
    }
    this.emit("more_output", mesg, mesg_length);
  };

  async stdin(prompt: string, password: boolean): Promise<string> {
    // See docs for stdin option to execute_code in backend jupyter.coffee
    this._push_mesg({ name: "input", opts: { prompt, password } });
    // Now we wait until the output message we just included has its
    // value set.  Then we call cb with that value.
    // This weird thing below sets this._stdin_cb, then
    // waits for this._stdin_cb to be called, which happens
    // when cell_changed gets called.
    return await callback((cb) => (this._stdin_cb = cb));
  }

  // Call this when the cell changes; only used for stdin right now.
  cell_changed = (cell: any, get_password: any): void => {
    if (this._state === "closed") {
      return;
    }
    if (this._stdin_cb == null) {
      return;
    }
    const output = cell != null ? cell.get("output") : undefined;
    if (output == null) {
      return;
    }
    const value = output.getIn([`${output.size - 1}`, "value"]);
    if (value != null) {
      let x = value;
      if (this._opts.cell.output) {
        const n = `${misc.len(this._opts.cell.output) - 1}`;
        if (
          get_password != null &&
          this._opts.cell.output[n] &&
          this._opts.cell.output[n].opts != null &&
          this._opts.cell.output[n].opts.password
        ) {
          // In case of a password, the value is NEVER placed in the document.
          // Instead the value is submitted to the backend via https, with
          // a random identifier put in the value.
          x = get_password(); // get actual password
        }
        if (this._opts.cell.output[`${n}`] != null) {
          this._opts.cell.output[`${n}`].value = value;
        } // sync output-handler view of output with syncdb
      }
      this._stdin_cb(undefined, x);
      delete this._stdin_cb;
    }
  };

  payload = (payload: any): void => {
    if (this._state === "closed") {
      return;
    }
    if (payload.source === "set_next_input") {
      this.set_input(payload.text);
    } else if (payload.source === "page") {
      // Just handle as a normal message; and we don't show in the pager,
      // which doesn't make sense for multiple users.
      // This happens when requesting help for r:
      // https://github.com/sagemathinc/cocalc/issues/1933
      this.message(payload);
    } else {
      // No idea what to do with this...
      if (typeof this._opts.dbg === "function") {
        this._opts.dbg(`Unknown PAYLOAD: ${misc.to_json(payload)}`);
      }
    }
  };
}
