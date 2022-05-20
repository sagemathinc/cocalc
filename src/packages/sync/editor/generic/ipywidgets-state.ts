/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
NOTE: Like much of our Jupyter-related code in CoCalc,
the code in this file is very much run in *both* the
frontend web browser and backend project server.
*/

import { EventEmitter } from "events";
import { Map as iMap } from "immutable";
import {
  close,
  delete_null_fields,
  len,
  auxFileToOriginal,
} from "@cocalc/util/misc";
import { SyncDoc } from "./sync-doc";
import { SyncTable } from "@cocalc/sync/table/synctable";
import { Client } from "./types";
import { delay } from "awaiting";
import { debounce } from "lodash";
import sha1 from "sha1";

type State = "init" | "ready" | "closed";

type Value = { [key: string]: any };

// When there is no activity for this much time, them we
// do some garbage collection.  This is only done in the
// backend project, and not by frontend browser clients.
// The garbage collection is deleting models and related
// data when they are not referenced in the notebook.
const GC_DEBOUNCE_MS = 15000;

interface CommMessage {
  header: { msg_id: string };
  parent_header: { msg_id: string };
  content: any;
  buffers: any[];
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
  private gc: Function;

  // TODO: garbage collect this, both on the frontend and backend.
  // This should be done in conjunction with the main table (with gc
  // on backend, and with change to null event on the frontend).
  private buffers: {
    [model_id: string]: { [path: string]: { buffer: Buffer; hash: string } };
  } = {};
  // Similar but used on frontend
  private arrayBuffers: {
    [model_id: string]: {
      [path: string]: { buffer: ArrayBuffer; hash: string };
    };
  } = {};

  // If capture_output[msg_id] is defined, then
  // all output with that msg_id is captured by the
  // widget with given model_id.   This data structure
  // is ONLY used in the project, and is not synced
  // between frontends and project.
  private capture_output: { [msg_id: string]: string[] } = {};

  // If the next output should be cleared.  Use for
  // clear_output with wait=true.
  private clear_output: { [model_id: string]: boolean } = {};

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
    this.gc = client.is_project() // no-op if not project
      ? debounce(() => {
          return; // temporarily disabled since it is still too aggressive
          if (this.state == "ready") {
            this.deleteUnused();
          }
        }, GC_DEBOUNCE_MS)
      : () => {};
  }

  public async init(): Promise<void> {
    const query = {
      ipywidgets: [
        {
          string_id: this.syncdoc.get_string_id(),
          model_id: null,
          type: null,
          data: null,
        },
      ],
    };
    this.table = await this.create_synctable(query, this.table_options, 0);

    // TODO: here the project should clear the table.

    this.set_state("ready");

    this.table.on("change", (keys) => {
      this.emit("change", keys);
    });
  }

  public keys(): { model_id: string; type: "value" | "state" | "buffer" }[] {
    // return type is arrow of s
    this.assert_state("ready");
    const x = this.table.get();
    if (x == null) {
      return [];
    }
    const keys: { model_id: string; type: "value" | "state" | "buffer" }[] = [];
    x.forEach((val, key) => {
      if (val.get("data") != null && key != null) {
        const [, model_id, type] = JSON.parse(key);
        keys.push({ model_id, type });
      }
    });
    return keys;
  }

  public get(model_id: string, type: string): iMap<string, any> | undefined {
    const key: string = JSON.stringify([
      this.syncdoc.get_string_id(),
      model_id,
      type,
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
    let value: any = this.get(model_id, "value");
    if (value != null) {
      value = value.toJS();
      if (value == null) {
        throw Error("value must be a map");
      }
      for (const key in value) {
        state_js[key] = value[key];
      }
    }
    return state_js;
  }

  public get_model_value(model_id: string): Value {
    this.assert_state("ready");
    let value: any = this.get(model_id, "value");
    if (value == null) {
      return {};
    }
    value = value.toJS();
    if (value == null) {
      return {};
    }
    return value;
  }

  /*
  Setting and getting buffers.

  - Setting the model buffers only happens on the backend project.
    This is done in response to a comm message from the kernel
    that has content.data.buffer_paths set.

  - Getting the model buffers only happens in the frontend browser.
    This happens when creating models that support widgets, and often
    happens in conjunction with deserialization.

    Getting a model buffer for a given path can happen
    *at any time* after the buffer is created, not just right when
    it is created like in JupyterLab!  The reason is because a browser
    can connect or get refreshed at any time, and then they need the
    buffer to reconstitue the model.  Moreover, a user might only
    scroll the widget into view in their (virtualized) notebook at any
    point, and it is only then that point the model gets created.
    This means that we have to store and garbage collect model
    buffers, which is a problem I don't think upstream ipywidgets
    has to solve.
  */
  public async get_model_buffers(model_id: string): Promise<{
    buffer_paths: string[][];
    buffers: ArrayBuffer[];
  }> {
    let value: iMap<string, string> | undefined = this.get(model_id, "buffers");
    if (value == null) {
      return { buffer_paths: [], buffers: [] };
    }
    // value is an array from JSON of paths array to array buffers:
    const buffer_paths: string[][] = [];
    const buffers: ArrayBuffer[] = [];
    if (this.arrayBuffers[model_id] == null) {
      this.arrayBuffers[model_id] = {};
    }
    const f = async (path: string) => {
      const hash = value?.get(path);
      if (hash == null) return;
      const cur = this.arrayBuffers[model_id][path];
      if (cur?.hash == hash) {
        buffer_paths.push(JSON.parse(path));
        buffers.push(cur.buffer);
        return;
      }
      // async get of the buffer efficiently via HTTP:
      if (this.client.ipywidgetsGetBuffer == null) {
        throw Error(
          "NotImplementedError: frontend client must implement ipywidgetsGetBuffer in order to support binary buffers"
        );
      }
      try {
        const buffer = await this.client.ipywidgetsGetBuffer(
          this.syncdoc.project_id,
          auxFileToOriginal(this.syncdoc.path),
          model_id,
          path
        );
        this.arrayBuffers[model_id][path] = { buffer, hash };
        buffer_paths.push(JSON.parse(path));
        buffers.push(buffer);
      } catch (err) {
        console.log(`skipping ${model_id}, ${path} due to ${err}`);
      }
    };
    // Run f in parallel on all of the keys of value:
    await Promise.all(value.keySeq().toJS().map(f));
    return { buffers, buffer_paths };
  }

  // Used on the backend by the project http server
  public getBuffer(model_id: string, buffer_path: string): Buffer | undefined {
    const dbg = this.dbg("getBuffer");
    dbg("getBuffer", model_id, buffer_path);
    return this.buffers[model_id]?.[buffer_path]?.buffer;
  }

  private set_model_buffers(
    model_id: string,
    buffer_paths: string[],
    buffers: Buffer[],
    fire_change_event: boolean = true
  ): void {
    const dbg = this.dbg("set_model_buffers");
    dbg("buffer_paths = ", buffer_paths);
    dbg("buffers=", buffers);

    const data: { [path: string]: boolean } = {};
    if (this.buffers[model_id] == null) {
      this.buffers[model_id] = {};
    }
    for (let i = 0; i < buffer_paths.length; i++) {
      const key = JSON.stringify(buffer_paths[i]);
      // we set to the sha1 of the buffer not to make getting
      // the buffer easy, but to make it easy to KNOW if we
      // even need to get the buffer.
      const hash = sha1(buffers[i]);
      data[key] = hash;
      this.buffers[model_id][key] = { buffer: buffers[i], hash };
    }
    this.set(model_id, "buffers", data, fire_change_event);
  }

  /*
  Setting model state and value

  - model state -- gets set once right when model is defined by kernel
  - model "value" -- should be called "update"; gets set with changes to
    the model state since it was created.
    (I think an inefficiency with this approach is the entire updated
    "value" gets broadcast each time anything about it is changed.
    Fortunately usually value is small.  However, it would be much
    better to broadcast only the information about what changed, though
    that is more difficult to implement given our current simple key:value
    store sync layer.  This tradeoff may be fully worth it for
    our applications, since large data should be in buffers, and those
    are efficient.)
  */

  public set_model_value(
    model_id: string,
    value: Value,
    fire_change_event: boolean = true
  ): void {
    this.set(model_id, "value", value, fire_change_event);
  }

  public set_model_state(
    model_id: string,
    state: any,
    fire_change_event: boolean = true
  ): void {
    this.set(model_id, "state", state, fire_change_event);
  }

  // Do any setting of the underlying table through this function.
  public set(
    model_id: string,
    type: "value" | "state" | "buffers" | "message",
    data: any,
    fire_change_event: boolean = true
  ): void {
    const string_id = this.syncdoc.get_string_id();
    if (typeof data != "object") {
      throw Error("TypeError -- data must be a map");
    }
    let merge: "none" | "shallow" | "deep";
    if (type == "value") {
      // we manually do the shallow merge only on the data field.
      const data0 = this.get_model_value(model_id);
      if (data0 != null) {
        for (const k in data) {
          data0[k] = data[k];
        }
        data = data0;
      }
      merge = "none";
    } else if (type == "buffers") {
      // we keep around the buffers that were
      // already set, but overwrite
      // when they change.
      merge = "deep";
    } else if (type == "message") {
      merge = "none";
    } else {
      merge = "deep";
    }
    this.table.set(
      { string_id, type, model_id, data },
      merge,
      fire_change_event
    );
  }

  public async save(): Promise<void> {
    this.gc();
    await this.table.save();
  }

  public async close(): Promise<void> {
    if (this.table != null) {
      await this.table.close();
    }
    close(this);
    this.set_state("closed");
  }

  private dbg(_f): Function {
    if (this.client.is_project()) {
      // TODO
      return this.client.dbg(`IpywidgetsState.${_f}`);
    } else {
      return (..._) => {};
    }
  }
  public async clear(): Promise<void> {
    // This is used when we restart the kernel -- we reset
    // things so no information about any models is known
    // and delete all Buffers.
    this.assert_state("ready");
    const dbg = this.dbg("clear");
    dbg();

    this.buffers = {};
    // There's no implemented delete for tables yet, so instead we set the data
    // for everything to null.  All other code related to widgets needs to handle
    // such data appropriately and ignore it.  (An advantage of this over trying to
    // implement a genuine delete is that delete is tricky when clients reconnect
    // and sync...). This table is in memory only anyways, so the table will get properly
    // fully flushed from existence at some point.
    const keys = this.table?.get()?.keySeq()?.toJS();
    if (keys == null) return; // nothing to do.
    for (const key of keys) {
      const [string_id, model_id, type] = JSON.parse(key);
      this.table.set({ string_id, type, model_id, data: null }, "none", false);
    }
    await this.table.save();
  }

  // Clean up all data in the table about models that are not
  // referenced (directly or indirectly) in any cell in the notebook.
  // There is also a comm:close event/message somewhere, which
  // could also be useful....?
  public async deleteUnused(): Promise<void> {
    this.assert_state("ready");
    const dbg = this.dbg("deleteUnused");
    dbg();
    // See comment in the "clear" function above about no delete for tables,
    // which is why we just set the data to null.
    const activeIds = this.getActiveModelIds();
    this.table.get()?.forEach((val, key) => {
      if (key == null || val == null || val.get("data") == null) return; // already deleted
      const [string_id, model_id, type] = JSON.parse(key);
      if (!activeIds.has(model_id)) {
        this.table.set(
          { string_id, type, model_id, data: null },
          "none",
          false
        );
      }
    });
    await this.table.save();
  }

  private getActiveModelIds(): Set<string> {
    // First we find the ids of models that are explicitly referenced
    // in the current version of the Jupyter notebook by iterating through
    // the output of all cells.
    const modelIds: Set<string> = new Set();
    this.syncdoc.get({ type: "cell" }).forEach((cell) => {
      const output = cell.get("output");
      if (output != null) {
        output.forEach((mesg) => {
          const model_id = mesg.getIn([
            "data",
            "application/vnd.jupyter.widget-view+json",
            "model_id",
          ]);
          if (model_id != null) {
            // same id could of course appear in multiple cells
            // if there are multiple view of the same model.
            modelIds.add(model_id);
          }
        });
      }
    });
    // Next, for each model we just found, we add in all the ids of models
    // that it explicitly references, e.g., by IPY_MODEL_[model_id] fields
    // and by output messages.
    let before = 0;
    let after = modelIds.size;
    while (before < after) {
      before = modelIds.size;
      for (const model_id of modelIds) {
        for (const type of ["state", "value"]) {
          const data = this.get(model_id, type);
          if (data == null) continue;
          for (const id of getModelIds(data)) {
            modelIds.add(id);
          }
        }
      }
      after = modelIds.size;
    }
    // Also any custom ways of doing referencing...
    this.includeThirdPartyReferences(modelIds);

    return modelIds;
  }

  private includeThirdPartyReferences(modelIds: Set<string>) {
    /*
    Motivation (RANT):
    It seems to me that third party widgets can just invent their own
    ways of referencing each other, and there's no way to know what they are
    doing.  The only possible way to do garbage collection is by reading
    and understanding their code or reverse engineering their data.
    It's not unlikely that any nontrivail third
    party widget has invented it's own custom way to do object references,
    and for every single one we may need to write custom code for garbage
    collection, which can randomly break if they change.
    <sarcasm>Yeah.</sarcasm>
    /*

    /* k3d:
    We handle k3d here, which creates models with
         {_model_module:'k3d', _model_name:'ObjectModel', id:number}
    where the id is in the object_ids attribute of some model found above:
       {_model_module:'k3d', object_ids:[..., id, ...]}
    But note that this format is something that was entirely just invented
    arbitrarily by the k3d dev.
    */
    // First get all object_ids of all active models:
    // We're not explicitly restricting to k3d here, since maybe other widgets use
    // this same approach, and the worst case scenario is just insufficient garbage collection.
    const object_ids = new Set<number>([]);
    for (const model_id of modelIds) {
      this.get(model_id, "state")
        ?.get("object_ids")
        ?.forEach((id) => {
          object_ids.add(id);
        });
    }
    if (object_ids.size == 0) {
      // nothing to do -- no such object_ids in any current models.
      return;
    }
    // let's find the models with these id's as id attribute and include them.
    this.table.get()?.forEach((val) => {
      if (object_ids.has(val?.getIn(["data", "id"]))) {
        const model_id = val.get("model_id");
        modelIds.add(model_id);
      }
    });
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
  process_comm_message_from_kernel gets called whenever the
  kernel emits a comm message related to widgets.  This updates
  the state of the table, which results in frontends creating widgets
  or updating state of widgets.
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
    dbg(`model_id=${model_id}`);

    const { data } = content;
    if (data == null) {
      dbg("content.data is null -- ignoring message");
      return;
    }

    const { state } = data;
    if (state != null) {
      delete_null_fields(state);
    }

    // It is critical to send any buffers data before
    // the other data; otherwise, deserialization on
    // the client side can't work, since it is missing
    // the data it needs.
    if (content.data.buffer_paths?.length > 0) {
      // Deal with binary buffers:
      dbg("setting binary buffers");
      this.set_model_buffers(
        model_id,
        content.data.buffer_paths,
        msg.buffers,
        false
      );
    }

    switch (content.data.method) {
      case "custom":
        const message = content.data.content;
        dbg("custom message", message);
        // NOTE: any buffers that are part of this comm message
        // already got set above.
        // We now send the message.
        this.sendCustomMessage(model_id, message, false);
        break;
      case "update":
        if (state == null) return;
        dbg("method -- update");
        if (this.clear_output[model_id] && state.outputs != null) {
          // we are supposed to clear the output before inserting
          // the next output.
          dbg("clearing outputs");
          if (state.outputs.length > 0) {
            state.outputs = [state.outputs[state.outputs.length - 1]];
          } else {
            state.outputs = [];
          }
          delete this.clear_output[model_id];
        }

        const last_changed =
          (this.get(model_id, "value")?.get("last_changed") ?? 0) + 1;
        this.set_model_value(model_id, { ...state, last_changed }, false);

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
              for (const m of w) {
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
        break;
      case undefined:
        if (state == null) return;
        dbg("method -- undefined (=initial set?)");
        this.set_model_state(model_id, state, false);
        break;
      default:
        // TODO: Implement other methods, e.g., 'display' -- see
        // https://github.com/jupyter-widgets/ipywidgets/blob/master/packages/schema/messages.md
        dbg(`not implemented method '${content.data.method}' -- ignoring`);
    }

    await this.save();
  }

  /*
  process_comm_message_from_widget gets called whenever a
  browser client emits a comm message related to widgets.
  This updates the state of the table, which results in
  other frontends updating their widget state, *AND* the backend
  kernel changing the value of variables (and possibly
  updating other widgets).
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
    if (this.capture_output[msg_id] == null) {
      return false;
    }
    const dbg = this.dbg("capture_output_message");
    dbg(JSON.stringify(mesg));
    const model_id =
      this.capture_output[msg_id][this.capture_output[msg_id].length - 1];
    if (model_id == null) return false; // should not happen.

    if (mesg.header.msg_type == "clear_output") {
      if (mesg.content != null && mesg.content.wait) {
        this.clear_output[model_id] = true;
      } else {
        delete this.clear_output[model_id];
        this.set_model_value(model_id, { outputs: [] });
      }
      return true;
    }

    if (mesg.content == null || len(mesg.content) == 0) {
      // no actual content.
      return false;
    }

    let outputs: any[];
    if (this.clear_output[model_id]) {
      delete this.clear_output[model_id];
      outputs = [];
    } else {
      outputs = this.get_model_value(model_id).outputs;
      if (outputs == null) {
        outputs = [];
      }
    }
    outputs.push(mesg.content);
    this.set_model_value(model_id, { outputs });
    return true;
  }

  private async sendCustomMessage(
    model_id: string,
    message: object,
    fire_change_event: boolean = true
  ): Promise<void> {
    /*
    Send a custom message.

    It's not at all clear what this should even mean in the context of
    realtime collaboration, and there will likely be clients where
    this is bad.  But for now, we just make the message available
    via the table for a few seconds, then remove it.  Any clients
    that are connected while we do this can react, and any that aren't
    just don't get the message (which is presumably fine).
    */

    this.set(model_id, "message", message, fire_change_event);
    await delay(3000);
    // Actually, delete is not implemented for synctable, so for
    // now we just set it to an empty message.
    this.set(model_id, "message", {}, fire_change_event);
  }

  public get_message(model_id: string) {
    return this.get(model_id, "message")?.toJS();
  }
}

// Get model id's that appear either as serialized references
// of the form IPY_MODEL_....
// or in output messages.
function getModelIds(x): Set<string> {
  const ids: Set<string> = new Set();
  x?.forEach((val, key) => {
    if (key == "application/vnd.jupyter.widget-view+json") {
      const model_id = val.get("model_id");
      if (model_id) {
        ids.add(model_id);
      }
    } else if (typeof val == "string") {
      if (val.startsWith("IPY_MODEL_")) {
        ids.add(val.slice("IPY_MODEL_".length));
      }
    } else if (val.forEach != null) {
      for (const z of getModelIds(val)) {
        ids.add(z);
      }
    }
  });
  return ids;
}
