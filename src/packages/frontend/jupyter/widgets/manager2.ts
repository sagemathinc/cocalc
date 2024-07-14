/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { createWidgetManager } from "@cocalc/widgets";
import type { WidgetEnvironment, Comm } from "@cocalc/widgets";
import { IpywidgetsState } from "@cocalc/sync/editor/generic/ipywidgets-state";
import { once } from "@cocalc/util/async-utils";
import { copy, is_array, len } from "@cocalc/util/misc";
import { fromJS } from "immutable";
import { CellOutputMessage } from "@cocalc/frontend/jupyter/output-messages/message";
import React from "react";
import ReactDOM from "react-dom/client";

export type SendCommFunction = (string, data) => string;

const log = console.log;

export class WidgetManager {
  public ipywidgets_state: IpywidgetsState;
  public manager;
  private last_changed: { [model_id: string]: { [key: string]: any } } = {};
  private state_lock: Set<string> = new Set();
  private watching: Set<string> = new Set();

  constructor(ipywidgets_state: IpywidgetsState) {
    this.ipywidgets_state = ipywidgets_state;
    if (this.ipywidgets_state.get_state() == "closed") {
      throw Error("ipywidgets_state must not be closed");
    }
    const provider = new Environment(this);
    this.manager = createWidgetManager(provider);
    this.ipywidgets_state.on("change", async (keys) => {
      for (const key of keys) {
        const [, model_id, type] = JSON.parse(key);
        this.handleIpWidgetsChange({ model_id, type });
      }
    });
  }

  private handleIpWidgetsChange = async ({ model_id, type }) => {
    log("handleIpWidgetsChange", { model_id, type });
    // let i = 0;
    //     while (!this.manager.has_model(model_id) && i < 10) {
    //       try {
    //         await this.manager.get_model(model_id);
    //         break;
    //       } catch (_err) {
    //         i += 1;
    //         await (require('awaiting').delay)(100);
    //         log("waiting for ", model_id);
    //       }
    //     }
    //     if (!this.manager.has_model(model_id)) {
    //       // TODO: maybe have to wait and keep trying until exists?
    //       log(
    //         "handleIpWidgetsChange: skipping since model not fully created",
    //       );
    //       return;
    //     }
    switch (type) {
      case "state":
        await this.ipywidgets_state_StateChange(model_id);
        break;
      case "value":
        await this.ipywidgets_state_ValueChange(model_id);
        break;
      case "buffers":
        await this.ipywidgets_state_BuffersChange(model_id);
        break;
      case "message":
        await this.ipywidgets_state_MessageChange(model_id);
        break;
      default:
        throw Error(`unknown state type '${type}'`);
    }
  };

  private ipywidgets_state_StateChange = async (model_id: string) => {
    return;
    log("handleStateChange: ", model_id);
    const state = this.ipywidgets_state.get_model_state(model_id);
    log("handleStateChange: state=", state);
    const model = await this.manager.get_model(model_id);
    model.set_state(state);
  };

  private ipywidgets_state_ValueChange = async (model_id: string) => {
    // log("handleValueChange: ", model_id);
    const changed = this.ipywidgets_state.get_model_value(model_id);
    // log("handleValueChange: changed=", model_id, changed);
    for (const k in changed) {
      if (typeof changed[k] == "string" && changed[k].startsWith("IPY_MODEL")) {
        delete changed[k];
      } else if (is_array(changed[k]) && typeof changed[k][0] == "string") {
        if (changed[k][0]?.startsWith("IPY_MODEL")) {
          delete changed[k];
        }
      }
    }
    if (
      this.last_changed[model_id] != null &&
      changed.last_changed != null &&
      changed.last_changed <= this.last_changed[model_id].last_changed
    ) {
      /* log(
        "skipping due to last change time",
        this.last_changed[model_id],
        changed.last_changed
      ); */
      if (changed.last_changed < this.last_changed[model_id].last_changed) {
        // log("strict inequality, so saving again");
        // This is necessary since SyncTable has fairly week guarantees
        // when you try to write tons of changing rapidly to the *same*
        // key (in this case the value). SyncTable was mainly designed
        // for lots of different keys (without changes), as comes up
        // with file editing where you're storing a log.  It's also fine
        // for changing a single key NOT rapidly.
        this.ipywidgets_state.set_model_value(
          model_id,
          this.last_changed[model_id],
        );
        this.ipywidgets_state.save();
      }
      return;
    }
    if (changed.last_changed != null) {
      this.last_changed[model_id] = changed;
    }
    this.state_lock.add(model_id);
    const model = await this.manager.get_model(model_id);
    if (model != null) {
      model.set_state(changed);
      await model.state_change;
    }
    this.state_lock.delete(model_id);
  };

  private ipywidgets_state_BuffersChange = async (model_id: string) => {
    log("handleBuffersChange: ", model_id);
    /*
    The data structures currently don't store which buffers changed, so we're
    updating all of them before, which is of course inefficient.

    We definitely do have to serialize, then pass to update_model, so that
    the widget can properly deserialize again, as I learned with k3d, which
    processes everything.
    */
    const model = await this.manager.get_model(model_id);
    const { buffer_paths } =
      await this.ipywidgets_state.get_model_buffers(model_id);
    const deserialized_state = model.get_state(true);
    const serializers = (model.constructor as any).serializers;
    const change: { [key: string]: any } = {};
    for (const paths of buffer_paths) {
      const key = paths[0];
      change[key] =
        serializers[key]?.serialize(deserialized_state[key]) ??
        deserialized_state[key];
    }
    model.set_state(change);
  };

  private ipywidgets_state_MessageChange = async (model_id: string) => {
    log("handleMessageChange: ", model_id);
  };

  // [ ] TODO: maybe have to keep trying for a while until model exists!
  watchModel = async (model_id: string) => {
    if (this.watching.has(model_id)) {
      return;
    }
    const model = await this.manager.get_model(model_id);
    model.on("change", this.handleModelChange);
    this.watching.add(model_id);
  };

  private handleModelChange = async (model): Promise<void> => {
    // log("handleModelChange", model);
    const { model_id } = model;
    await model.state_change;
    if (this.state_lock.has(model_id)) {
      return;
    }
    const changed: any = copy(model.serialize(model.changed));
    delete changed.children; // sometimes they are in there, but shouldn't be sync'ed.
    const { last_changed } = changed;
    delete changed.last_changed;
    if (len(changed) == 0) {
      return; // nothing
    }
    // increment sequence number.
    changed.last_changed =
      Math.max(
        last_changed ?? 0,
        this.last_changed[model_id]?.last_changed ?? 0,
      ) + 1;
    this.last_changed[model_id] = changed;
    this.ipywidgets_state.set_model_value(model_id, changed, true);
    this.ipywidgets_state.save();
  };
}

class Environment implements WidgetEnvironment {
  private manager: WidgetManager;
  constructor(manager) {
    this.manager = manager;
  }

  async getModelState(model_id) {
    if (this.manager.ipywidgets_state.get_state() != "ready") {
      await once(this.manager.ipywidgets_state, "ready");
    }
    const state = this.manager.ipywidgets_state.get_model_state(model_id);
    setTimeout(() => this.manager.watchModel(model_id), 1);
    if (!state) {
      return undefined;
    }
    return {
      modelName: state._model_name,
      modelModule: state._model_module,
      modelModuleVersion: state._model_module_version,
      state,
    };
  }

  async openCommChannel(
    targetName: string,
    data?: unknown,
    buffers?: ArrayBuffer[],
  ): Promise<Comm> {
    log("openCommChannel", { targetName, data, buffers });
    const comm = {
      send(data: unknown, opts?: { buffers?: ArrayBuffer[] }) {
        return new Promise<void>((resolve, _reject) => {
          log("Data sent:", data, "With options:", opts);
          resolve();
        });
      },

      close() {
        log("Connection closed");
      },

      get messages() {
        const message = {
          data: "Hello",
          buffers: [new ArrayBuffer(8)],
        };
        return {
          [Symbol.asyncIterator]: async function* () {
            yield message;
          },
        };
      },
    };
    return comm;
  }

  async renderOutput(outputItem: any, destination: Element): Promise<void> {
    // the guassian plume notebook has example of this!
    log("renderOutput", { outputItem, destination });
    //$(destination).append($(`<pre>${JSON.stringify(outputItem)}</pre>`));
    const message = fromJS(outputItem);
    const myDiv = document.createElement("div");
    destination.appendChild(myDiv);
    const component = React.createElement(CellOutputMessage, { message }, null);
    const root = ReactDOM.createRoot(myDiv);
    root.render(component);
  }
}
