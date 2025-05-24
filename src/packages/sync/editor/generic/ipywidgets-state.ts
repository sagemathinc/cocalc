/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
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
  is_object,
  len,
  auxFileToOriginal,
  sha1,
} from "@cocalc/util/misc";
import { SyncDoc } from "./sync-doc";
import { SyncTable } from "@cocalc/sync/table/synctable";
import { Client } from "./types";
import { debounce } from "lodash";

type State = "init" | "ready" | "closed";

type Value = { [key: string]: any };

// When there is no activity for this much time, them we
// do some garbage collection.  This is only done in the
// backend project, and not by frontend browser clients.
// The garbage collection is deleting models and related
// data when they are not referenced in the notebook.
// Also, we don't implement complete object delete yet so instead we
// set the data field to null, which clears all state about and
// object and makes it easy to know to ignore it.
const GC_DEBOUNCE_MS = 10000;

// If for some reason GC needs to be deleted, e.g., maybe you
// suspect a bug, just toggle this flag.  In particular, note
// includeThirdPartyReferences below that has to deal with a special
// case schema that k3d uses for references, which they just made up,
// which works with official upstream, since that has no garbage
// collection.
const DISABLE_GC = false;

// ignore messages past this age.
const MAX_MESSAGE_TIME_MS = 10000;

interface CommMessage {
  header: { msg_id: string };
  parent_header: { msg_id: string };
  content: any;
  buffers: any[];
}

export interface Message {
  // don't know yet...
}

export type SerializedModelState = { [key: string]: any };

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
    [model_id: string]: {
      [path: string]: { buffer: Buffer; hash: string };
    };
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
    this.table_options = [{ ephemeral: true }];
    this.gc =
      !DISABLE_GC && client.is_project() // no-op if not project or DISABLE_GC
        ? debounce(() => {
            // return; // temporarily disabled since it is still too aggressive
            if (this.state == "ready") {
              this.deleteUnused();
            }
          }, GC_DEBOUNCE_MS)
        : () => {};
  }

  init = async (): Promise<void> => {
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
  };

  keys = (): { model_id: string; type: "value" | "state" | "buffer" }[] => {
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
  };

  get = (model_id: string, type: string): iMap<string, any> | undefined => {
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
  };

  // assembles together state we know about the widget with given model_id
  // from info in the table, and returns it as a Javascript object.
  getSerializedModelState = (
    model_id: string,
  ): SerializedModelState | undefined => {
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
  };

  get_model_value = (model_id: string): Value => {
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
  };

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
  getModelBuffers = async (
    model_id: string,
  ): Promise<{
    buffer_paths: string[][];
    buffers: ArrayBuffer[];
  }> => {
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
      if (!hash) {
        // It is important to look for !hash, since we use hash='' as a sentinel (in this.clearOutputBuffers)
        // to indicate that we want to consider a buffer as having been deleted. This is very important
        // to do since large outputs are often buffers in output widgets, and clear_output
        // then needs to delete those buffers, or output never goes away.
        return;
      }
      const cur = this.arrayBuffers[model_id][path];
      if (cur?.hash == hash) {
        buffer_paths.push(JSON.parse(path));
        buffers.push(cur.buffer);
        return;
      }
      try {
        const buffer = await this.clientGetBuffer(model_id, path);
        this.arrayBuffers[model_id][path] = { buffer, hash };
        buffer_paths.push(JSON.parse(path));
        buffers.push(buffer);
      } catch (err) {
        console.log(`skipping ${model_id}, ${path} due to ${err}`);
      }
    };
    // Run f in parallel on all of the keys of value:
    await Promise.all(
      value
        .keySeq()
        .toJS()
        .filter((path) => path.startsWith("["))
        .map(f),
    );
    return { buffers, buffer_paths };
  };

  // This is used on the backend when syncing changes from project nodejs *to*
  // the jupyter kernel.
  getKnownBuffers = (model_id: string) => {
    let value: iMap<string, string> | undefined = this.get(model_id, "buffers");
    if (value == null) {
      return { buffer_paths: [], buffers: [] };
    }
    // value is an array from JSON of paths array to array buffers:
    const buffer_paths: string[][] = [];
    const buffers: ArrayBuffer[] = [];
    if (this.buffers[model_id] == null) {
      this.buffers[model_id] = {};
    }
    const f = (path: string) => {
      const hash = value?.get(path);
      if (!hash) {
        return;
      }
      const cur = this.buffers[model_id][path];
      if (cur?.hash == hash) {
        buffer_paths.push(JSON.parse(path));
        buffers.push(new Uint8Array(cur.buffer).buffer);
        return;
      }
    };
    value
      .keySeq()
      .toJS()
      .filter((path) => path.startsWith("["))
      .map(f);
    return { buffers, buffer_paths };
  };

  private clientGetBuffer = async (model_id: string, path: string) => {
    // async get of the buffer from backend
    if (this.client.ipywidgetsGetBuffer == null) {
      throw Error(
        "NotImplementedError: frontend client must implement ipywidgetsGetBuffer in order to support binary buffers",
      );
    }
    const b = await this.client.ipywidgetsGetBuffer(
      this.syncdoc.project_id,
      auxFileToOriginal(this.syncdoc.path),
      model_id,
      path,
    );
    return b;
  };

  // Used on the backend by the project http server
  getBuffer = (
    model_id: string,
    buffer_path_or_sha1: string,
  ): Buffer | undefined => {
    const dbg = this.dbg("getBuffer");
    dbg("getBuffer", model_id, buffer_path_or_sha1);
    return this.buffers[model_id]?.[buffer_path_or_sha1]?.buffer;
  };

  // returns the sha1 hashes of the buffers
  setModelBuffers = (
    // model that buffers are associated to:
    model_id: string,
    // if given, these are buffers with given paths; if not given, we
    // store buffer associated to sha1 (which is used for custom messages)
    buffer_paths: string[][] | undefined,
    // the actual buffers.
    buffers: Buffer[],
    fire_change_event: boolean = true,
  ): string[] => {
    const dbg = this.dbg("setModelBuffers");
    dbg("buffer_paths = ", buffer_paths);

    const data: { [path: string]: boolean } = {};
    if (this.buffers[model_id] == null) {
      this.buffers[model_id] = {};
    }
    const hashes: string[] = [];
    if (buffer_paths != null) {
      for (let i = 0; i < buffer_paths.length; i++) {
        const key = JSON.stringify(buffer_paths[i]);
        // we set to the sha1 of the buffer not just to make getting
        // the buffer easy, but to make it easy to KNOW if we
        // even need to get the buffer.
        const hash = sha1(buffers[i]);
        hashes.push(hash);
        data[key] = hash;
        this.buffers[model_id][key] = { buffer: buffers[i], hash };
      }
    } else {
      for (const buffer of buffers) {
        const hash = sha1(buffer);
        hashes.push(hash);
        this.buffers[model_id][hash] = { buffer, hash };
        data[hash] = hash;
      }
    }
    this.set(model_id, "buffers", data, fire_change_event);
    return hashes;
  };

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

  set_model_value = (
    model_id: string,
    value: Value,
    fire_change_event: boolean = true,
  ): void => {
    this.set(model_id, "value", value, fire_change_event);
  };

  set_model_state = (
    model_id: string,
    state: any,
    fire_change_event: boolean = true,
  ): void => {
    this.set(model_id, "state", state, fire_change_event);
  };

  // Do any setting of the underlying table through this function.
  set = (
    model_id: string,
    type: "value" | "state" | "buffers" | "message",
    data: any,
    fire_change_event: boolean = true,
    merge?: "none" | "shallow" | "deep",
  ): void => {
    //const dbg = this.dbg("set");
    const string_id = this.syncdoc.get_string_id();
    if (typeof data != "object") {
      throw Error("TypeError -- data must be a map");
    }
    let defaultMerge: "none" | "shallow" | "deep";
    if (type == "value") {
      //defaultMerge = "shallow";
      // we manually do the shallow merge only on the data field.
      const current = this.get_model_value(model_id);
      // this can be HUGE:
      // dbg("value: before", { data, current });
      if (current != null) {
        for (const k in data) {
          if (is_object(data[k]) && is_object(current[k])) {
            current[k] = { ...current[k], ...data[k] };
          } else {
            current[k] = data[k];
          }
        }
        data = current;
      }
      // dbg("value -- after", { merged: data });
      defaultMerge = "none";
    } else if (type == "buffers") {
      // it's critical to not throw away existing buffers when
      // new ones come or current ones change.  With shallow merge,
      // the existing ones go away, which is very broken, e.g.,
      // see this with this example:
      /*
import bqplot.pyplot as plt
import numpy as np
x, y = np.random.rand(2, 10)
fig = plt.figure(animation_duration=3000)
scat = plt.scatter(x=x, y=y)
fig
---
scat.x, scat.y = np.random.rand(2, 50)

# now close and open it, and it breaks with shallow merge,
# since the second cell caused the opacity buffer to be
# deleted, which breaks everything.
*/
      defaultMerge = "deep";
    } else if (type == "message") {
      defaultMerge = "none";
    } else {
      defaultMerge = "deep";
    }
    if (merge == null) {
      merge = defaultMerge;
    }
    this.table.set(
      { string_id, type, model_id, data },
      merge,
      fire_change_event,
    );
  };

  save = async (): Promise<void> => {
    this.gc();
    await this.table.save();
  };

  close = async (): Promise<void> => {
    if (this.table != null) {
      await this.table.close();
    }
    close(this);
    this.set_state("closed");
  };

  private dbg = (_f): Function => {
    if (this.client.is_project()) {
      return this.client.dbg(`IpywidgetsState.${_f}`);
    } else {
      return (..._) => {};
    }
  };

  clear = async (): Promise<void> => {
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
  };

  values = () => {
    const x = this.table.get();
    if (x == null) {
      return [];
    }
    return Object.values(x.toJS()).filter((obj) => obj.data);
  };

  // Clean up all data in the table about models that are not
  // referenced (directly or indirectly) in any cell in the notebook.
  // There is also a comm:close event/message somewhere, which
  // could also be useful....?
  deleteUnused = async (): Promise<void> => {
    this.assert_state("ready");
    const dbg = this.dbg("deleteUnused");
    dbg();
    // See comment in the "clear" function above about no delete for tables,
    // which is why we just set the data to null.
    const activeIds = this.getActiveModelIds();
    this.table.get()?.forEach((val, key) => {
      if (key == null || val?.get("data") == null) {
        // already deleted
        return;
      }
      const [string_id, model_id, type] = JSON.parse(key);
      if (!activeIds.has(model_id)) {
        // Delete this model from the table (or as close to delete as we have).
        // This removes the last message, state, buffer info, and value,
        // depending on type.
        this.table.set(
          { string_id, type, model_id, data: null },
          "none",
          false,
        );

        // Also delete buffers for this model, which are stored in memory, and
        // won't be requested again.
        delete this.buffers[model_id];
      }
    });
    await this.table.save();
  };

  // For each model in init, we add in all the ids of models
  // that it explicitly references, e.g., by IPY_MODEL_[model_id] fields
  // and by output messages and other things we learn about (e.g., k3d
  // has its own custom references).
  getReferencedModelIds = (init: string | Set<string>): Set<string> => {
    const modelIds =
      typeof init == "string" ? new Set([init]) : new Set<string>(init);
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
    // Also any custom ways of doing referencing -- e.g., k3d does this.
    this.includeThirdPartyReferences(modelIds);

    // Also anything that references any modelIds
    this.includeReferenceTo(modelIds);

    return modelIds;
  };

  // We find the ids of all models that are explicitly referenced
  // in the current version of the Jupyter notebook by iterating through
  // the output of all cells, then expanding the result to everything
  // that these models reference.  This is used as a foundation for
  // garbage collection.
  private getActiveModelIds = (): Set<string> => {
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
    return this.getReferencedModelIds(modelIds);
  };

  private includeReferenceTo = (modelIds: Set<string>) => {
    // This example is extra tricky and one version of our GC broke it:
    // from ipywidgets import VBox, jsdlink, IntSlider, Button; s1 = IntSlider(max=200, value=100); s2 = IntSlider(value=40); jsdlink((s1, 'value'), (s2, 'max')); VBox([s1, s2])
    // What happens here is that this jsdlink model ends up referencing live widgets,
    // but is not referenced by any cell, so it would get garbage collected.

    let before = -1;
    let after = modelIds.size;
    while (before < after) {
      before = modelIds.size;
      this.table.get()?.forEach((val) => {
        const data = val?.get("data");
        if (data != null) {
          for (const model_id of getModelIds(data)) {
            if (modelIds.has(model_id)) {
              modelIds.add(val.get("model_id"));
            }
          }
        }
      });
      after = modelIds.size;
    }
  };

  private includeThirdPartyReferences = (modelIds: Set<string>) => {
    /*
    Motivation (RANT):
    It seems to me that third party widgets can just invent their own
    ways of referencing each other, and there's no way to know what they are
    doing.  The only possible way to do garbage collection is by reading
    and understanding their code or reverse engineering their data.
    It's not unlikely that any nontrivial third
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
      for (const type of ["state", "value"]) {
        this.get(model_id, type)
          ?.get("object_ids")
          ?.forEach((id) => {
            object_ids.add(id);
          });
      }
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
  };

  // The finite state machine state, e.g., 'init' --> 'ready' --> 'close'
  private set_state = (state: State): void => {
    this.state = state;
    this.emit(state);
  };

  get_state = (): State => {
    return this.state;
  };

  private assert_state = (state: string): void => {
    if (this.state != state) {
      throw Error(`state must be "${state}" but it is "${this.state}"`);
    }
  };

  /*
  process_comm_message_from_kernel gets called whenever the
  kernel emits a comm message related to widgets.  This updates
  the state of the table, which results in frontends creating widgets
  or updating state of widgets.
  */
  process_comm_message_from_kernel = async (
    msg: CommMessage,
  ): Promise<void> => {
    const dbg = this.dbg("process_comm_message_from_kernel");
    // WARNING: serializing any msg could cause huge server load, e.g., it could contain
    // a 20MB buffer in it.
    //dbg(JSON.stringify(msg));  // EXTREME DANGER!
    //console.log("process_comm_message_from_kernel", msg);
    dbg(JSON.stringify(msg.header));
    this.assert_state("ready");

    const { content } = msg;

    if (content == null) {
      dbg("content is null -- ignoring message");
      return;
    }

    if (content.data.method == "echo_update") {
      // just ignore echo_update -- it's a new ipywidgets 8 mechanism
      // for some level of RTC sync between clients -- we don't need that
      // since we have our own, obviously. Setting the env var
      // JUPYTER_WIDGETS_ECHO to 0 will disable these messages to slightly
      // reduce traffic.
      // NOTE: this check was lower which wrecked the buffers,
      // which was a bug for a long time. :-(
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
    dbg({ model_id, comm_id });

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
    // This happens with method "update".  With method="custom",
    // there is just an array of buffers and no buffer_paths at all.
    if (content.data.buffer_paths?.length > 0) {
      // Deal with binary buffers:
      dbg("setting binary buffers");
      this.setModelBuffers(
        model_id,
        content.data.buffer_paths,
        msg.buffers,
        false,
      );
    }

    switch (content.data.method) {
      case "custom":
        const message = content.data.content;
        const { buffers } = msg;
        dbg("custom message", {
          message,
          buffers: `${buffers?.length ?? "no"} buffers`,
        });
        let buffer_hashes: string[];
        if (
          buffers != null &&
          buffers.length > 0 &&
          content.data.buffer_paths == null
        ) {
          // TODO
          dbg("custom message  -- there are BUFFERS -- saving them");
          buffer_hashes = this.setModelBuffers(
            model_id,
            undefined,
            buffers,
            false,
          );
        } else {
          buffer_hashes = [];
        }
        // We now send the message.
        this.sendCustomMessage(model_id, message, buffer_hashes, false);
        break;

      case "echo_update":
        return;

      case "update":
        if (state == null) {
          return;
        }
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
        dbg("method -- undefined (=set_model_state)", { model_id, state });
        this.set_model_state(model_id, state, false);
        break;
      default:
        // TODO: Implement other methods, e.g., 'display' -- see
        // https://github.com/jupyter-widgets/ipywidgets/blob/master/packages/schema/messages.md
        dbg(`not implemented method '${content.data.method}' -- ignoring`);
    }

    await this.save();
  };

  /*
  process_comm_message_from_browser gets called whenever a
  browser client emits a comm message related to widgets.
  This updates the state of the table, which results in
  other frontends updating their widget state, *AND* the backend
  kernel changing the value of variables (and possibly
  updating other widgets).
  */
  process_comm_message_from_browser = async (
    msg: CommMessage,
  ): Promise<void> => {
    const dbg = this.dbg("process_comm_message_from_browser");
    dbg(msg);
    this.assert_state("ready");
    // TODO: not implemented!
  };

  // The mesg here is exactly what came over the IOPUB channel
  // from the kernel.

  // TODO: deal with buffers
  capture_output_message = (mesg: any): boolean => {
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
      if (mesg.content?.wait) {
        this.clear_output[model_id] = true;
      } else {
        delete this.clear_output[model_id];
        this.clearOutputBuffers(model_id);
        this.set_model_value(model_id, { outputs: null });
      }
      return true;
    }

    if (mesg.content == null || len(mesg.content) == 0) {
      // no actual content.
      return false;
    }

    let outputs: any;
    if (this.clear_output[model_id]) {
      delete this.clear_output[model_id];
      this.clearOutputBuffers(model_id);
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
  };

  private clearOutputBuffers = (model_id: string) => {
    // TODO: need to clear all output buffers.
    /* Example where if you do not properly clear buffers, then broken output re-appears:

import ipywidgets as widgets
from IPython.display import YouTubeVideo
out = widgets.Output(layout={'border': '1px solid black'})
out.append_stdout('Output appended with append_stdout')
out.append_display_data(YouTubeVideo('eWzY2nGfkXk'))
out

---

out.clear_output()

---

with out:
   print('hi')
    */
    // TODO!!!!

    const y: any = {};
    let n = 0;
    for (const jsonPath of this.get(model_id, "buffers")?.keySeq() ?? []) {
      const path = JSON.parse(jsonPath);
      if (path[0] == "outputs") {
        y[jsonPath] = "";
        n += 1;
      }
    }
    if (n > 0) {
      this.set(model_id, "buffers", y, true, "shallow");
    }
  };

  private sendCustomMessage = async (
    model_id: string,
    message: object,
    buffer_hashes: string[],
    fire_change_event: boolean = true,
  ): Promise<void> => {
    /*
    Send a custom message.

    It's not at all clear what this should even mean in the context of
    realtime collaboration, and there will likely be clients where
    this is bad.  But for now, we just make the last message sent
    available via the table, and each successive message overwrites the previous
    one.  Any clients that are connected while we do this can react,
    and any that aren't just don't get the message (which is presumably fine).

    Some widgets like ipympl use this to initialize state, so when a new
    client connects, it requests a message describing the plot, and everybody
    receives it.
    */

    this.set(
      model_id,
      "message",
      { message, buffer_hashes, time: Date.now() },
      fire_change_event,
    );
  };

  // Return the most recent message for the given model.
  getMessage = async (
    model_id: string,
  ): Promise<{ message: object; buffers: ArrayBuffer[] } | undefined> => {
    const x = this.get(model_id, "message")?.toJS();
    if (x == null) {
      return undefined;
    }
    if (Date.now() - (x.time ?? 0) >= MAX_MESSAGE_TIME_MS) {
      return undefined;
    }
    const { message, buffer_hashes } = x;
    let buffers: ArrayBuffer[] = [];
    for (const hash of buffer_hashes) {
      buffers.push(await this.clientGetBuffer(model_id, hash));
    }
    return { message, buffers };
  };
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
