//##############################################################################
//
//    CoCalc: Collaborative Calculation in the Cloud
//    Copyright (C) 2016, Sagemath Inc., AGPLv3.
//
//##############################################################################

/*
Evaluation of code with streaming output built on both the clients and
server (local hub) using a sync_table.  This evaluator is associated
to a syncdoc editing session, and provides code evaluation that
may be used to enhance the experience of document editing.
*/

const stringify = require("json-stable-stringify");

import { callback } from "awaiting";
import { SyncDoc } from "./sync-doc";
import { SyncTable } from "../../table/synctable";
import { to_key } from "../../table/util";
import { Client } from "./types";
import { sagews, MARKERS, FLAGS } from "../../../sagews";

const {
  from_json,
  to_json,
  copy_without,
  copy_with,
} = require("../../../misc");

type State = "init" | "ready" | "closed";

// What's supported so far.
type Program = "sage" | "bash";

// Object whose meaning depends on the program
type Input = any;

export class Evaluator {
  private syncdoc: SyncDoc;
  private client: Client;
  private inputs_table: SyncTable;
  private outputs_table: SyncTable;
  private sage_session: any;
  private state: State = "init";
  private table_options: any[] = [];
  private create_synctable: Function;

  private last_call_time: Date = new Date(0);

  constructor(syncdoc: SyncDoc, client: Client, create_synctable: Function) {
    this.syncdoc = syncdoc;
    this.client = client;
    this.create_synctable = create_synctable;
    if (this.syncdoc.data_server == "project") {
      // options only supported for project...
      this.table_options = [{ ephemeral: true, persistent: true }];
    }
  }

  public async init(): Promise<void> {
    // Initialize the inputs and outputs tables in parallel:
    const i = this.init_eval_inputs();
    const o = this.init_eval_outputs();
    await Promise.all([i, o]);

    if (this.client.is_project()) {
      this.init_project_evaluator();
    }
    this.set_state("ready");
  }

  public async close(): Promise<void> {
    if (this.inputs_table != null) {
      await this.inputs_table.close();
      delete this.inputs_table;
    }
    if (this.outputs_table != null) {
      await this.outputs_table.close();
      delete this.outputs_table;
    }
    if (this.sage_session != null) {
      this.sage_session.close();
      delete this.sage_session;
    }
    this.set_state("closed");
  }

  private dbg(_f): Function {
    if (this.client.is_project()) {
      return this.client.dbg(`Evaluator.${_f}`);
    } else {
      return (..._) => {};
    }
  }

  private async init_eval_inputs(): Promise<void> {
    const query = {
      eval_inputs: [
        {
          string_id: this.syncdoc.get_string_id(),
          input: null,
          time: null,
          user_id: null,
        },
      ],
    };
    this.inputs_table = await this.create_synctable(
      query,
      this.table_options,
      0
    );
  }

  private async init_eval_outputs(): Promise<void> {
    const query = {
      eval_outputs: [
        {
          string_id: this.syncdoc.get_string_id(),
          output: null,
          time: null,
          number: null,
        },
      ],
    };
    this.outputs_table = await this.create_synctable(
      query,
      this.table_options,
      0
    );
    this.outputs_table.setMaxListeners(200); // in case of many evaluations at once.
  }

  private set_state(state: State): void {
    this.state = state;
  }

  private assert_not_closed(): void {
    if (this.state === "closed") {
      throw Error("closed");
    }
  }

  private assert_is_project(): void {
    if (!this.client.is_project()) {
      throw Error("BUG -- this code should only run in the project.");
    }
  }

  private assert_is_browser(): void {
    if (this.client.is_project()) {
      throw Error("BUG -- this code should only run in the web browser.");
    }
  }

  // If given, cb below is called repeatedly with results as they appear.
  public call(opts: { program: Program; input: Input; cb?: Function }): void {
    this.assert_not_closed();
    this.assert_is_browser();
    const dbg = this.dbg("call");
    dbg(opts.program, opts.input, opts.cb != undefined);

    let time = this.client.server_time();
    // Perturb time if it is <= last time when this client did an evaluation.
    // We do this so that the time below is different than anything else.
    if (time <= this.last_call_time) {
      // slightly later
      time = new Date(this.last_call_time.valueOf() + 1);
    }
    // make time be congruent to our uid
    this.last_call_time = time;

    const user_id: number = this.syncdoc.get_my_user_id();
    const obj = {
      string_id: this.syncdoc.get_string_id(),
      time,
      user_id,
      input: copy_without(opts, "cb"),
    };
    dbg(JSON.stringify(obj));
    this.inputs_table.set(obj);
    // root cause of https://github.com/sagemathinc/cocalc/issues/1589
    this.inputs_table.save();

    if (opts.cb == null) {
      // Fire and forget -- no need to listen for responses.
      dbg("no cb defined, so fire and forget");
      return;
    }

    // Listen for output until we receive a message with mesg.done true.
    const messages = {};

    // output may appear in random order, so we use mesg_number
    // to sort it out.
    let mesg_number = 0;

    const send = (mesg) => {
      dbg("send", mesg);
      if (mesg.done) {
        this.outputs_table.removeListener("change", handle_output);
      }
      if (opts.cb != null) {
        opts.cb(mesg);
      }
    };

    const handle_output = (keys: string[]) => {
      // console.log("handle_output #{to_json(keys)}")
      dbg("handle_output", keys);
      this.assert_not_closed();
      for (const key of keys) {
        const t = from_json(key);
        if (t[1].valueOf() != time.valueOf()) {
          dbg("not our eval", t[1].valueOf(), time.valueOf());
          continue;
        }
        const x = this.outputs_table.get(key);
        if (x == null) {
          dbg("x is null");
          continue;
        }
        const y = x.get("output");
        if (y == null) {
          dbg("y is null");
          continue;
        }
        dbg("y = ", JSON.stringify(y.toJS()));
        const mesg = y.toJS();
        if (mesg == null) {
          dbg("probably never happens, but makes typescript happy.");
          continue;
        }
        // OK, we called opts.cb on output mesg with the given timestamp and user_id...
        delete mesg.id; // waste of space

        // Messages may arrive in somewhat random order.  This *DOES HAPPEN*,
        // since changes are output from the project by computing a diff of
        // a synctable, and then an array of objects sent out... and
        // the order in that diff is random.
        // E.g. this in a Sage worksheet would break:
        //    for i in range(20): print i; sys.stdout.flush()
        if (t[2] !== mesg_number) {
          // Not the next message, so put message in the
          // set of messages that arrived too early.
          dbg("put message in holding", t[2], mesg_number);
          messages[t[2]] = mesg;
          continue;
        }

        // Finally, the right message to handle next.
        // Inform caller of result
        send(mesg);
        mesg_number += 1;

        // Then, push out any messages that arrived earlier
        // that are ready to send.
        while (messages[mesg_number] != null) {
          send(messages[mesg_number]);
          delete messages[mesg_number];
          mesg_number += 1;
        }
      }
    };

    this.outputs_table.on("change", handle_output);
  }

  private execute_sage_code_hook(output_uuid: string): Function {
    this.assert_is_project();
    const dbg = this.dbg(`execute_sage_code_hook('${output_uuid}')`);
    dbg();
    this.assert_not_closed();

    // We track the output_line from within this project, and compare
    // to what is set in the document (by the user).  If they go out
    // of sync for a while, we fill in the result.
    // TODO: since it's now possible to know whether or not users are
    // connected... maybe we could use that instead?
    let output_line = MARKERS.output;

    const hook = (mesg) => {
      dbg(`processing mesg '${to_json(mesg)}'`);
      let content = this.syncdoc.to_str();
      let i = content.indexOf(MARKERS.output + output_uuid);
      if (i === -1) {
        // no cell anymore, so do nothing further right now.
        return;
      }
      i += 37;
      const n = content.indexOf("\n", i);
      if (n === -1) {
        // corrupted? -- don't try further right now.
        return;
      }
      // This is what the frontend also does:
      output_line +=
        stringify(copy_without(mesg, ["id", "event"])) + MARKERS.output;

      if (output_line.length - 1 <= n - i) {
        // Things are looking fine (at least, the line is longer enough).
        // TODO: try instead comparing actual content, not just length?
        // Or maybe don't... since this stupid code will all get deleted anyways
        // when we rewrite sagews handling.
        return;
      }

      dbg("browser client didn't maintain sync promptly. fixing");
      dbg(
        `sage_execute_code: i=${i}, n=${n}, output_line.length=${output_line.length}`
      );
      dbg(`output_line='${output_line}', sync_line='${content.slice(i, n)}'`);
      const x = content.slice(0, i);
      content = x + output_line + content.slice(n);
      if (mesg.done) {
        let j = x.lastIndexOf(MARKERS.cell);
        if (j !== -1) {
          j = x.lastIndexOf("\n", j);
          const cell_id = x.slice(j + 2, j + 38);
          //dbg("removing a cell flag: before='#{content}', cell_id='#{cell_id}'")
          const S = sagews(content);
          S.remove_cell_flag(cell_id, FLAGS.running);
          S.set_cell_flag(cell_id, FLAGS.this_session);
          content = S.content;
        }
      }
      //dbg("removing a cell flag: after='#{content}'")
      this.syncdoc.from_str(content);
      this.syncdoc.commit();
    };

    return (mesg) => {
      setTimeout(() => hook(mesg), 5000);
    };
  }

  private handle_input_change(key: string): void {
    this.assert_not_closed();
    this.assert_is_project();

    const dbg = this.dbg("handle_input_change");
    dbg(`change: ${key}`);

    const t = from_json(key);
    let number, string_id, time;
    const id = ([string_id, time, number] = [t[0], t[1], 0]);
    if (this.outputs_table.get(to_key(id)) != null) {
      dbg("already being handled");
      return;
    }
    dbg(`no outputs yet with key ${to_json(id)}`);
    const r = this.inputs_table.get(key);
    if (r == null) {
      dbg("deleting from input?");
      throw Error("deleting from input not implemented");
      // happens when deleting from input table (if that is
      // ever supported, e.g., for maybe trimming old evals...)
      return;
    }
    const input = r.get("input");
    if (input == null) {
      throw Error("input must be specified");
      return;
    }
    const x = input.toJS();
    dbg("x = ", x);
    if (x == null) {
      throw Error("BUG: can't happen");
      return;
    }
    if (x.program == null || x.input == null) {
      this.outputs_table.set({
        string_id,
        time,
        number,
        output: {
          error: "must specify both program and input",
          done: true,
        },
      });
      this.outputs_table.save();
      return;
    }

    let f;
    switch (x.program) {
      case "sage":
        f = this.evaluate_using_sage;
        break;
      case "shell":
        f = this.evaluate_using_shell;
        break;
      default:
        this.outputs_table.set({
          string_id,
          time,
          number,
          output: {
            error: `no program '${x.program}'`,
            done: true,
          },
        });
        this.outputs_table.save();
        return;
    }
    f = f.bind(this);

    let hook: Function;
    if (
      x.program === "sage" &&
      x.input.event === "execute_code" &&
      x.input.output_uuid != null
    ) {
      hook = this.execute_sage_code_hook(x.input.output_uuid);
    } else {
      // no op
      hook = (_) => {};
    }

    f(x.input, (output) => {
      this.assert_not_closed();

      dbg(`got output='${to_json(output)}'; id=${to_json(id)}`);
      hook(output);
      this.outputs_table.set({ string_id, time, number, output });
      this.outputs_table.save();
      number += 1;
    });
  }

  // Runs only in the project
  private init_project_evaluator(): void {
    this.assert_is_project();

    const dbg = this.dbg("init_project_evaluator");
    dbg("init");
    this.inputs_table.on("change", (keys) => {
      for (const key of keys) {
        this.handle_input_change(key);
      }
    });
    /* CRITICAL: it's very important to handle all the inputs
       that may have happened just moments before
       this object got created.  Why? The first input is
       the user trying to frickin' evaluate a cell
       in their worksheet to start things running... and they
       might somehow do that moments before the worksheet
       gets opened on the backend; if we don't do the
       following, then often this eval is missed, and
       confusion and frustration ensues. */
    const v = this.inputs_table.get();
    if (v != null) {
      dbg(`handle ${v.size} pending evaluations`);
      v.forEach((_, key) => {
        if (key != null) {
          this.handle_input_change(key);
        }
      });
    }
  }

  private ensure_sage_session_exists(): void {
    if (this.sage_session != null) return;
    this.dbg("ensure_sage_session_exists")();
    // This code only runs in the project, where client
    // has a sage_session method.
    this.sage_session = (this.client as any).sage_session({
      path: this.syncdoc.get_path(),
    });
  }

  // Runs only in the project
  private async evaluate_using_sage(input: Input, cb: Function): Promise<void> {
    this.assert_is_project();
    const dbg = this.dbg("evaluate_using_sage");
    dbg();

    // TODO: input also may have -- uuid, output_uuid, timeout
    if (input.event === "execute_code") {
      input = copy_with(input, ["code", "data", "preparse", "event", "id"]);
      dbg(
        "ensure sage session is running, so we can actually execute the code"
      );
    }
    await this.ensure_sage_session_exists();
    if (input.event === "execute_code") {
      // We only need to actually create the socket, which makes a running process,
      // if we are going to execute code.  The other events, e.g., 'status' don't
      // need a running sage session.
      if (!this.sage_session.is_running()) {
        await callback(this.sage_session.init_socket);
      }
    }
    dbg("send call to backend sage session manager", to_json(input));
    this.sage_session.call({ input, cb });
  }

  // Runs only in the project
  private evaluate_using_shell(input: Input, cb: Function): void {
    this.assert_is_project();
    const dbg = this.dbg("evaluate_using_shell");
    dbg();

    input.cb = (err, output) => {
      if (output == null) {
        output = {};
      }
      if (err) {
        output.error = err;
      }
      output.done = true;
      cb(output);
    };
    (this.client as any).shell(input);
  }
}
