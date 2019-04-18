import { EventEmitter } from "events";
import { Map as iMap } from "immutable";

import { delete_null_fields, len } from "../../../misc2";

import { SyncDoc } from "./sync-doc";
import { SyncTable } from "../../table/synctable";
import { Client } from "./types";

type State = "init" | "ready" | "closed";

interface CommMessage {
  header: { msg_id: string };
  parent_header: { msg_id: string };
  content: any;
}

export interface Message {
  // don't know yet...
}

export type ModelState = { [key: string]: any };

export class IpywidgetsState extends EventEmitter {
  private syncdoc: SyncDoc;
  private client: Client;
  private table: SyncTable;
  private state: State = "init";
  private table_options: any[] = [];
  private create_synctable: Function;

  // If capture_output[msg_id] is defined, then
  // all output with that msg_id is captured by the
  // widget with given model_id.   This data structure
  // is ONLY used in the project, and is not synced
  // between frontends and project.
  private capture_output: { [msg_id: string]: string[] } = {};

  constructor(syncdoc: SyncDoc, client: Client, create_synctable: Function) {
    super();
    this.syncdoc = syncdoc;
    this.client = client;
    this.create_synctable = create_synctable;
    if (this.syncdoc.data_server == "project") {
      // options only supported for project...
      // ephemeral -- don't store longterm in database
      // persistent -- doesn't automatically vanish when all browser clients disconnect
      this.table_options = [{ ephemeral: true, persistent: true }];
    }
  }

  public async init(): Promise<void> {
    const query = {
      ipywidgets: [
        {
          string_id: this.syncdoc.get_string_id(),
          model_id: null,
          type: null,
          data: null
        }
      ]
    };
    this.table = await this.create_synctable(query, this.table_options, 0);

    // TODO: here the project should clear the table.

    this.set_state("ready");

    this.table.on("change", keys => {
      this.emit("change", keys);
    });
  }

  public keys(): any {
    // return type is immutable js iterator
    this.assert_state("ready");
    const x = this.table.get();
    if (x == null) {
      return [];
    } else {
      return x.keys();
    }
  }

  public get(model_id: string, type: string): iMap<string, any> | undefined {
    const key: string = JSON.stringify([
      this.syncdoc.get_string_id(),
      model_id,
      type
    ]);
    const record = this.table.get(key);
    if (record == null) {
      return undefined;
    }
    return record.get("data");
  }

  // assembles together state we know about the widget with given model_id
  // from info in the table, and returns it as a Javascript object.
  public get_model_state(model_id: string): ModelState | undefined {
    this.assert_state("ready");
    const state = this.get(model_id, "state");
    if (state == null) {
      return undefined;
    }
    const state_js = state.toJS();
    let value = this.get(model_id, "value");
    if (value != null) {
      value = value.toJS();
      if (value == null) {
        throw Error("value must be a map");
      }
      if (value["value"] != null) {
        state_js["value"] = value["value"];
      }
    }
    return state_js;
  }

  public get_model_value(model_id: string): any {
    this.assert_state("ready");
    let value = this.get(model_id, "value");
    if (value == null) {
      return undefined;
    }
    value = value.toJS();
    if (value == null) {
      return undefined;
    }
    return value["value"];
  }

  public set_model_value(model_id: string, value: any): void {
    this.set(model_id, "value", value);
  }

  public set_model_state(model_id: string, state: any): void {
    this.set(model_id, "state", state);
  }

  // Do any setting of the underlying table through this function.
  public set(model_id: string, type: "value" | "state", data: any): void {
    if (type === "value") {
      // wrap as a map
      data = { value: data };
    }
    const string_id = this.syncdoc.get_string_id();
    if (typeof data != "object") {
      throw Error("TypeError -- data must be a map");
    }
    this.table.set({ string_id, type, data, model_id });
  }

  public async save(): Promise<void> {
    await this.table.save();
  }

  public async close(): Promise<void> {
    if (this.table != null) {
      await this.table.close();
      delete this.table;
    }
    this.set_state("closed");
  }

  private dbg(_f): Function {
    if (this.client.is_project() || true) {
      // TODO
      return this.client.dbg(`IpywidgetsState.${_f}`);
    } else {
      return (..._) => {};
    }
  }
  public async clear(): Promise<void> {
    // TODO -- delete everything from table.
    // This is needed when we restart the kernel.
    this.assert_state("ready");
    const dbg = this.dbg("clear");
    dbg("NOT IMPLEMENTED");
  }

  // The finite state machine state, e.g., 'init' --> 'ready' --> 'close'
  private set_state(state: State): void {
    this.state = state;
  }

  public get_state(): State {
    return this.state;
  }

  private assert_state(state: string): void {
    if (this.state != state) {
      throw Error(`state must be "${state}" but it is "${this.state}"`);
    }
  }

  /*
  process_comm_message_from_kernel gets called whenever the kernel emits a comm
  message related to widgets.  This updates the state of the table, which
  results in frontends creating or updating widgets.
  */
  public async process_comm_message_from_kernel(
    msg: CommMessage
  ): Promise<void> {
    const dbg = this.dbg("process_comm_message_from_kernel");
    dbg(JSON.stringify(msg));
    this.assert_state("ready");

    const { content } = msg;

    if (content == null) {
      dbg("content is null -- ignoring message");
      return;
    }

    let { comm_id } = content;
    if (comm_id == null) {
      if (msg.header != null) {
        comm_id = msg.header.msg_id;
      }
      if (comm_id == null) {
        dbg("comm_id is null -- ignoring message");
        return;
      }
    }
    const model_id: string = comm_id;

    const { data } = content;
    if (data == null) {
      dbg("content.data is null -- ignoring message");
      return;
    }

    // TODO: handle buffers somehow.

    const { state } = data;
    if (state == null) {
      dbg("state is null -- ignoring message");
      return;
    }

    delete_null_fields(state);

    switch (content.data.method) {
      case "update":
        dbg("method -- update");
        let { value } = state;
        if (value == null && state.outputs != null) {
          // the output widget stores its "value" in "outputs",
          // rather than in value, but we just simplify things.
          value = state.outputs;
          delete state.outputs;
        }
        delete state.value;
        if (value != null) {
          this.set(model_id, "value", value);
        }

        if (state.msg_id != null) {
          const { msg_id } = state;
          if (typeof msg_id === "string" && msg_id.length > 0) {
            dbg("enabling capture output", msg_id, model_id);
            if (this.capture_output[msg_id] == null) {
              this.capture_output[msg_id] = [model_id];
            } else {
              // pushing onto stack
              this.capture_output[msg_id].push(model_id);
            }
          } else {
            const parent_msg_id = msg.parent_header.msg_id;
            dbg("disabling capture output", parent_msg_id, model_id);
            if (this.capture_output[parent_msg_id] != null) {
              const v: string[] = [];
              const w: string[] = this.capture_output[parent_msg_id];
              for (let m of w) {
                if (m != model_id) {
                  v.push(m);
                }
              }
              if (v.length == 0) {
                delete this.capture_output[parent_msg_id];
              } else {
                this.capture_output[parent_msg_id] = v;
              }
            }
          }
          delete state.msg_id;
        }

        if (len(state) > 0) {
          this.set(model_id, "state", state);
        }
        break;
      case undefined:
        dbg("method -- undefined (=initial set?)");
        this.set(model_id, "state", state);
        break;
      default:
        // TODO: Implement other methods, e.g., 'display' -- see
        // https://github.com/jupyter-widgets/ipywidgets/blob/master/packages/schema/messages.md
        dbg(`not implemented method '${content.data.method}' -- ignoring`);
    }

    await this.save();
  }

  /*
  process_comm_message_from_widget gets called whenever a browser client emits a comm
  message related to widgets.  This updates the state of the table, which
  results in other frontends updating their widget state, *AND* the backend
  kernel changing the value of variables (and possibly updating other widgets).
  */
  public async process_comm_message_from_browser(
    msg: CommMessage
  ): Promise<void> {
    const dbg = this.dbg("process_comm_message_from_browser");
    dbg(msg);
    this.assert_state("ready");
    // TODO: not implemented!
  }

  // The mesg here is exactly what came over the IOPUB channel
  // from the kernel.

  // TODO: deal with buffers
  public capture_output_message(mesg: any): boolean {
    const msg_id = mesg.parent_header.msg_id;
    if (this.capture_output[msg_id] == null) return false;
    const dbg = this.dbg("capture_output_message");
    dbg(JSON.stringify(mesg));
    const model_id = this.capture_output[msg_id][
      this.capture_output[msg_id].length - 1
    ];
    if (mesg.content == null || len(mesg.content) == 0)
      // no actual content.
      return false;
    let value = this.get_model_value(model_id);
    if (value == null) {
      value = [];
    }
    value.push(mesg.content);
    this.set(model_id, "value", value);
    return true;
  }

  public capture_output_clear(): void {
    const dbg = this.dbg("capture_output_clear");
    dbg("TODO");
  }
}
