/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
//##############################################################################
//
//    CoCalc: Collaborative Calculation in the Cloud
//    Copyright (C) 2016, Sagemath Inc., AGPLv3.
//
//##############################################################################

/*
Evaluation of code with streaming output built on both the clients and
server (local hub) using a sync_table.  This evaluator is associated
to a syncstring editing session, and provides code evaluation that
may be used to enhance the experience of document editing.
*/

import { SyncDoc } from "./sync-doc";

const async = require("async");
const stringify = require("json-stable-stringify");

const sagews = require("../../../sagews");
const { from_json, to_json, copy_without } = require("../../../misc");

const { defaults, required } = misc;

export class Evaluator {
  private syncdoc: SyncDoc;

  constructor(syncdoc: SyncDoc) {
    this.syncdoc = syncdoc;
  }

  public async init(): Promise<void> {
    this._init_sync_tables(err => {
      if (err) {
        return typeof cb === "function" ? cb(err) : undefined;
      } else {
        if (this.syncdoc.client.is_project()) {
          this._init_project_evaluator();
        }
        return typeof cb === "function" ? cb() : undefined;
      }
    });
  }

  _init_sync_tables(cb) {
    return async.parallel(
      [this._init_eval_inputs, this._init_eval_outputs],
      err => cb(err)
    );
  }

  _init_eval_inputs = async cb => {
    const query = {
      eval_inputs: {
        string_id: this.syncdoc.string_id,
        input: null
      }
    };
    this._inputs = await this.syncdoc.client.synctable_project(
      this.syncdoc.project_id,
      query,
      [{ ephemeral: true }],
      0
    );
    return typeof cb === "function" ? cb() : undefined;
  };

  _init_eval_outputs = async cb => {
    const query = {
      eval_outputs: {
        string_id: this.syncdoc.string_id,
        output: null
      }
    };
    this._outputs = await this.syncdoc.client.synctable_project(
      this.syncdoc.project_id,
      query,
      [{ ephemeral: true }],
      0
    );
    this._outputs.setMaxListeners(100); // in case of many evaluations at once.
    return typeof cb === "function" ? cb() : undefined;
  };

  close() {
    this._closed = true;
    if (this._inputs != null) {
      this._inputs.close();
    }
    delete this._inputs;
    if (this._outputs != null) {
      this._outputs.close();
    }
    delete this._outputs;
    if (this._sage_session != null) {
      this._sage_session.close();
    }
    return delete this._sage_session;
  }

  call(opts) {
    opts = defaults(opts, {
      program: required, // 'sage', 'bash'
      input: required, // object whose meaning depends on the program
      cb: undefined
    });
    if (this._closed) {
      if (typeof opts.cb === "function") {
        opts.cb("closed");
      }
      return;
    }
    let time = this.syncdoc.client.server_time();
    // Perturb time if it is <= last time when this client did an evaluation.
    // We do this so that the time below is different than anything else.
    // TODO: This is NOT 100% yet, due to multiple clients possibly starting
    // different evaluations simultaneously.
    if (this._last_time != null && time <= this._last_time) {
      time = new Date(this._last_time - 0 + 1); // one millesecond later
    }
    this._last_time = time;

    this._inputs.set({
      string_id: this.syncdoc.string_id,
      time,
      user_id: 0,
      input: misc.copy_without(opts, "cb")
    });
    this._inputs.save(); // root cause of https://github.com/sagemathinc/cocalc/issues/1589
    if (opts.cb == null) {
      return;
    }
    // Listen for output until we receive a message with mesg.done true.
    const messages = {};
    let mesg_number = 0;
    const send = mesg => {
      if (mesg.done) {
        this._outputs.removeListener("change", handle_output);
      }
      return opts.cb(mesg);
    };

    var handle_output = keys => {
      // console.log("handle_output #{misc.to_json(keys)}")
      if (this._closed) {
        if (typeof opts.cb === "function") {
          opts.cb("closed");
        }
        return;
      }
      return (() => {
        const result = [];
        for (let key of keys) {
          const t = misc.from_json(key);
          if (t[1] - time === 0) {
            // we called opts.cb on output with the given timestamp
            const mesg = __guard__(
              __guard__(this._outputs.get(key), x1 => x1.get("output")),
              x => x.toJS()
            );
            if (mesg != null) {
              delete mesg.id; // waste of space
              // This code is written under the assumption that messages may
              // arrive in somewhat random order.  This *DOES HAPPEN*, since
              // changes are output from the project by computing a diff of
              // a synctable, and then an array of objects sent out... and
              // the order in that diff is random.
              // E.g. this in a Sage worksheet would break:
              //    for i in range(20): print i; sys.stdout.flush()
              if (t[2] === mesg_number) {
                // t[2] is the sequence number of the message
                // Inform caller of result
                send(mesg);
                // Push out any messages that arrived earlier that are ready to send.
                mesg_number += 1;
                result.push(
                  (() => {
                    const result1 = [];
                    while (messages[mesg_number] != null) {
                      send(messages[mesg_number]);
                      delete messages[mesg_number];
                      result1.push((mesg_number += 1));
                    }
                    return result1;
                  })()
                );
              } else {
                // Put message in the queue of messages that arrived too early
                result.push((messages[t[2]] = mesg));
              }
            } else {
              result.push(undefined);
            }
          } else {
            result.push(undefined);
          }
        }
        return result;
      })();
    };

    return this._outputs.on("change", handle_output);
  }

  _execute_code_hook(output_uuid) {
    const dbg = this.syncdoc.client.dbg(`_execute_code_hook('${output_uuid}')`);
    dbg();
    if (this._closed) {
      dbg("closed");
      return;
    }

    let output_line = sagews.MARKERS.output;
    var process = mesg => {
      dbg(`processing mesg '${misc.to_json(mesg)}'`);
      let content = this.syncdoc.to_str();
      let i = content.indexOf(sagews.MARKERS.output + output_uuid);
      if (i === -1) {
        // no cell anymore -- do nothing further
        process = undefined;
        return;
      }
      i += 37;
      const n = content.indexOf("\n", i);
      if (n === -1) {
        // corrupted
        return;
      }
      output_line +=
        stringify(misc.copy_without(mesg, ["id", "event"])) +
        sagews.MARKERS.output;
      // dbg("sage_execute_code: i=#{i}, n=#{n}, output_line.length=#{output_line.length}, output_line='#{output_line}', sync_line='#{content.slice(i,n)}'")
      if (output_line.length - 1 > n - i) {
        dbg(
          "sage_execute_code: initiating client didn't maintain sync promptly. fixing"
        );
        const x = content.slice(0, i);
        content = x + output_line + content.slice(n);
        if (mesg.done) {
          let j = x.lastIndexOf(sagews.MARKERS.cell);
          if (j !== -1) {
            j = x.lastIndexOf("\n", j);
            const cell_id = x.slice(j + 2, j + 38);
            //dbg("removing a cell flag: before='#{content}', cell_id='#{cell_id}'")
            const S = sagews.sagews(content);
            S.remove_cell_flag(cell_id, sagews.FLAGS.running);
            S.set_cell_flag(cell_id, sagews.FLAGS.this_session);
            ({ content } = S);
          }
        }
        //dbg("removing a cell flag: after='#{content}'")
        this.syncdoc.from_str(content);
        return this.syncdoc.save();
      }
    };

    const hook = mesg => {
      return setTimeout(
        () => (typeof process === "function" ? process(mesg) : undefined),
        5000
      );
    };
    return hook;
  }

  _handle_input_change(key) {
    let number, string_id, time;
    const dbg = this.syncdoc.client.dbg("_handle_input_change");
    dbg(`change: ${key}`);
    if (this._closed) {
      dbg("closed");
      return;
    }
    const t = misc.from_json(key);
    const id = ([string_id, time, number] = [t[0], t[1], 0]);
    if (this._outputs.get(JSON.stringify(id)) == null) {
      dbg(`no outputs with key ${misc.to_json(id)}`);
      const x = __guardMethod__(
        __guard__(this._inputs.get(key), x1 => x1.get("input")),
        "toJS",
        o => o.toJS()
      ); // could be deleting a key!
      if (x == null) {
        return;
      }
      if (x.program != null && x.input != null) {
        const f = this[`_evaluate_using_${x.program}`];
        if (f != null) {
          let hook;
          if (x.input.event === "execute_code" && x.input.output_uuid != null) {
            hook = this._execute_code_hook(x.input.output_uuid);
          }
          return f(x.input, output => {
            if (this._closed) {
              return;
            }
            dbg(`got output='${misc.to_json(output)}'; id=${misc.to_json(id)}`);
            if (typeof hook === "function") {
              hook(output);
            }
            this._outputs.set({ string_id, time, number, output });
            this._outputs.save();
            return (number += 1);
          });
        } else {
          this._outputs.set({
            string_id,
            time,
            number,
            output: misc.to_json({
              error: `no program '${x.program}'`,
              done: true
            })
          });
          return this._outputs.save();
        }
      } else {
        this._outputs.set({
          string_id,
          time,
          number,
          output: misc.to_json({
            error: "must specify program and input",
            done: true
          })
        });
        return this._outputs.save();
      }
    }
  }

  // Runs only in the project
  _init_project_evaluator() {
    const dbg = this.syncdoc.client.dbg("project_evaluator");
    dbg("init");
    this._inputs.on("change", keys => {
      return keys.map(key => this._handle_input_change(key));
    });
    // CRITICAL: it's very important to handle all the inputs that may have happened just moments before
    // this object got created.  Why, since the first one is the user trying to frickin' evaluate a cell
    // in their worksheet to start things running... and they do that usually moments before the worksheet
    // gets opened on the backend; if we don't do the following, then often this is missed, and great
    // confusion and frustration ensues.
    dbg("handle any pending evaluations");
    return this._inputs.get().forEach((val, key) => {
      this._handle_input_change(key);
    });
  }

  // Runs only in the project
  _evaluate_using_sage(input, cb) {
    if (this._sage_session == null) {
      this._sage_session = this.syncdoc.client.sage_session({
        path: this.syncdoc.path
      });
    }
    // TODO: input also may have -- uuid, output_uuid, timeout
    if (input.event === "execute_code") {
      input = misc.copy_with(input, [
        "code",
        "data",
        "preparse",
        "event",
        "id"
      ]);
    }
    return this._sage_session.call({
      input,
      cb
    });
  }

  // Runs only in the project
  _evaluate_using_shell(input, cb) {
    input.cb = (err, output) => {
      if (output == null) {
        output = {};
      }
      if (err) {
        output.error = err;
      }
      output.done = true;
      return cb(output);
    };
    return this.syncdoc.client.shell(input);
  }
}

function __guard__(value, transform) {
  return typeof value !== "undefined" && value !== null
    ? transform(value)
    : undefined;
}
function __guardMethod__(obj, methodName, transform) {
  if (
    typeof obj !== "undefined" &&
    obj !== null &&
    typeof obj[methodName] === "function"
  ) {
    return transform(obj, methodName);
  } else {
    return undefined;
  }
}
