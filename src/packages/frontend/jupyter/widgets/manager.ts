/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as base from "@jupyter-widgets/base";
import { createWidgetManager, is_unpack_models } from "@cocalc/widgets";
import type {
  WidgetEnvironment,
  IClassicComm,
  ICallbacks,
  JSONValue,
  JSONObject,
} from "@cocalc/widgets";
import {
  IpywidgetsState,
  SerializedModelState,
} from "@cocalc/sync/editor/generic/ipywidgets-state";
import { once } from "@cocalc/util/async-utils";
import { is_array, is_object, len, uuid } from "@cocalc/util/misc";
import { fromJS } from "immutable";
import { CellOutputMessage } from "@cocalc/frontend/jupyter/output-messages/message";
import React from "react";
import ReactDOM from "react-dom/client";
import type { JupyterActions } from "@cocalc/frontend/jupyter/browser-actions";
import { FileContext } from "@cocalc/frontend/lib/file-context";
import { FrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import getAnchorTagComponent from "@cocalc/frontend/project/page/anchor-tag-component";

import { delay } from "awaiting";

const K3D_DELAY_MS = 25;

type DeserializedModelState = { [key: string]: any };

export type SendCommFunction = (string, data) => string;

//const log = console.log;
const log = (..._args) => {};

export class WidgetManager {
  public ipywidgets_state: IpywidgetsState;
  public actions: JupyterActions;
  public manager;
  private last_changed: { [model_id: string]: { [key: string]: any } } = {};
  private state_lock: Set<string> = new Set();
  private watching: Set<string> = new Set();
  public k3dObjectIds = new Set<number>();

  constructor({
    ipywidgets_state,
    actions,
  }: {
    ipywidgets_state: IpywidgetsState;
    actions: JupyterActions;
  }) {
    this.ipywidgets_state = ipywidgets_state;
    this.actions = actions;
    if (this.ipywidgets_state.get_state() == "closed") {
      throw Error("ipywidgets_state must not be closed");
    }
    const provider = new Environment(this);
    this.manager = createWidgetManager(provider);

    this.initAllModels();
    this.ipywidgets_state.on("change", async (keys) => {
      for (const key of keys) {
        const [, model_id, type] = JSON.parse(key);
        this.handleIpwidgetsTableChange({ model_id, type });
      }
    });
  }

  private initAllModels = async () => {
    /*
    With this disabled, this breaks for RTC or close/open:

from ipywidgets import VBox, jsdlink, IntSlider
s1 = IntSlider(max=200, value=100); s2 = IntSlider(value=40)
jsdlink((s1, 'value'), (s2, 'max'))
VBox([s1, s2])
    */

    if (this.ipywidgets_state.get_state() == "init") {
      await once(this.ipywidgets_state, "ready");
    }
    if (this.ipywidgets_state.get_state() != "ready") {
      return;
    }
    for (const { model_id, type } of this.ipywidgets_state.keys()) {
      if (type == "state") {
        (async () => {
          try {
            // causes initialization:
            await this.manager.get_model(model_id);
            // also ensure any buffers are set, e.g., this is needed when loading
            // https://ipywidgets.readthedocs.io/en/latest/examples/Widget%20List.html#image
            // so don't have to evaluate the cell on first load.
            await this.ipywidgets_state_BuffersChange(model_id);
          } catch (err) {
            log("initAllModels", err);
          }
        })();
      }
    }
  };

  private handleIpwidgetsTableChange = async ({ model_id, type }) => {
    log("handleIpwidgetsTableChange", { model_id, type });
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
        // This is how custom comm messages would get delivered
        await this.ipywidgets_state_MessageChange(model_id);
        break;
      default:
        throw Error(`unknown state type '${type}'`);
    }
  };

  private ipywidgets_state_StateChange = async (model_id: string) => {
    // Overall state is only used for creating widget when it is
    // rendered for the first time as part of Environment.getSerializedModelState,
    // if it is called.  Some widgets though need to get created, but they are
    // never rendered, so we only know about them due to state change.
    //
    // First: We only do this once if getSerializedModelState didn't happen.  Updates for RTC use
    // type='value'. Doing this causes a lot of noise, which e.g., completely
    // breaks rendering using the threejs custom widgets, e.g., this breaks;
    //   from pythreejs import DodecahedronGeometry; DodecahedronGeometry()
    //
    // Second: This example shows that sometimes getSerializedModelState is never called, so
    // it's important to call this in some cases:
    //   from ipywidgets import VBox, jsdlink, IntSlider, Button; s1 = IntSlider(max=200, value=100); s2 = IntSlider(value=40); VBox([s1, s2])
    //   jsdlink((s1, 'value'), (s2, 'max'))
    //

    // The solution: make sure the model gets created if state change is called.
    // This results in getSerializedModelState being called and causes no
    // problems if it were getting called anyways and works in both cases above.
    await this.manager.get_model(model_id);
  };

  private updateModel = async (
    model_id: string,
    changed: SerializedModelState,
    merge: boolean,
  ): Promise<void> => {
    const model = await this.manager.get_model(model_id);
    log("updateModel", { model_id, merge, changed });
    if (model.module == "k3d") {
      // k3d invents its own ad hoc inter-model reference scheme, so we have
      // to deal with that.
      if (changed.object_ids != null) {
        while (!isSubset(changed.object_ids, this.k3dObjectIds)) {
          log("k3d -- waiting for object_ids", changed.object_ids);
          await delay(K3D_DELAY_MS);
        }
      }
    }

    //log(`setting state of model "${model_id}" to `, change);
    if (changed.last_changed != null) {
      this.last_changed[model_id] = changed;
    }

    changed = await this.deserializeState(model, changed);

    if (changed.hasOwnProperty("outputs") && changed["outputs"] == null) {
      // It can definitely be 'undefined' but set, e.g., the 'out.clear_output()' example at
      // https://ipywidgets.readthedocs.io/en/latest/examples/Output%20Widget.html
      // causes this, which then totally breaks rendering (due to how the
      // upstream widget manager works).  This works around that.
      changed["outputs"] = [];
    }
    if (merge) {
      const deserializedState = model.get_state(false);
      const x: DeserializedModelState = {};
      for (const k in changed) {
        if (
          deserializedState[k] != null &&
          is_object(deserializedState[k]) &&
          is_object(changed[k])
        ) {
          x[k] = { ...deserializedState[k], ...changed[k] };
        } else {
          x[k] = changed[k];
        }
      }
      changed = x;
    }

    const success = await this.dereferenceModelLinks(changed);
    if (!success) {
      console.warn(
        "update model suddenly references not known models -- can't handle this yet (TODO!); ignoring update.",
      );
      return;
    }

    log("updateModel -- doing set", {
      model_id,
      merge,
      changed: { ...changed },
    });
    try {
      model.set(changed);
    } catch (err) {
      // window.z = { merge, model, model_id, changed: { ...changed } };
      console.error("updateModel set failed -- ", err);
    }
  };

  // ipywidgets_state_ValueChange is called when a value entry of the ipywidgets_state
  // table is changed, e.g., when the backend decides a model should change or another client
  // changes something, or even this client changes something.  When another client is
  // responsible for the change, we make the change to the ipywidgets model here.
  private ipywidgets_state_ValueChange = async (model_id: string) => {
    // log("handleValueChange: ", model_id);
    const changed = this.ipywidgets_state.get_model_value(model_id);
    log("handleValueChange: changed=", model_id, changed);
    if (
      this.last_changed[model_id] != null &&
      changed.last_changed != null &&
      changed.last_changed <= this.last_changed[model_id].last_changed
    ) {
      log(
        "handleValueChange: skipping due to last_changed sequence number -- i.e., change caused by this client",
        this.last_changed[model_id],
        changed.last_changed,
      );
      if (changed.last_changed < this.last_changed[model_id].last_changed) {
        log("handleValueChange: strict inequality, so saving again");
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
    log("handleValueChange: got model and now making this change -- ", changed);
    await this.updateModel(model_id, changed, true);
    const model = await this.manager.get_model(model_id);
    if (model != null) {
      await model.state_change;
    }
    this.state_lock.delete(model_id);
  };

  // Mutate state to account for any buffers.  We have to do
  // this any time we update the model via the updateModel
  // function; otherwise the state that is getting sync'd around
  // between clients will just forget the buffers that are set
  // via ipywidgets_state_BuffersChange!
  private setBuffers = async (
    model_id: string,
    state: SerializedModelState,
  ): Promise<void> => {
    const { buffer_paths, buffers } =
      await this.ipywidgets_state.getModelBuffers(model_id);
    log("setBuffers", model_id, buffer_paths);
    if (buffer_paths.length == 0) {
      return; // nothing to do
    }
    // convert each ArrayBuffer in buffers to a DataView.
    const paths: string[][] = [];
    const vals: any[] = [];
    for (let i = 0; i < buffers.length; i++) {
      if (state[buffer_paths[i][0]] == null) {
        continue;
      }
      vals.push(new DataView(buffers[i]));
      paths.push(buffer_paths[i]);
    }
    put_buffers(state, paths, vals);
  };

  private ipywidgets_state_BuffersChange = async (model_id: string) => {
    /*
    The data structures currently don't store which buffers changed, so we're
    updating all of them before, which is of course inefficient.

    We definitely do have to serialize, then pass to updateModel, so that
    the widget can properly deserialize again, as I learned with k3d, which
    processes everything.

    A simple example that uses buffers is this image one:
       https://ipywidgets.readthedocs.io/en/latest/examples/Widget%20List.html#image
    */
    const { buffer_paths, buffers } =
      await this.ipywidgets_state.getModelBuffers(model_id);
    if (buffer_paths.length == 0) {
      return;
    }
    log("handleBuffersChange: ", { model_id, buffer_paths, buffers });
    const state = this.ipywidgets_state.getSerializedModelState(model_id);
    if (state == null) {
      log("handleBuffersChange: no state data", { model_id });
      return;
    }
    const change: { [key: string]: any } = {};
    for (let i = 0; i < buffer_paths.length; i++) {
      const key = buffer_paths[i][0];
      setInObject(state, buffer_paths[i], new DataView(buffers[i]));
      change[key] = state[key];
    }
    if (len(change) > 0) {
      const model = await this.manager.get_model(model_id);
      const deserializedChange = await this.deserializeState(model, change);
      log("handleBuffersChange: settings ", model_id, {
        change,
        deserializedChange,
      });
      try {
        model.set(deserializedChange);
      } catch (err) {
        // window.y = { model_id, model, change, buffer_paths, buffers };
        console.error("ipywidgets_state_BuffersChange failed -- ", err);
      }
    }
  };

  private ipywidgets_state_MessageChange = async (model_id: string) => {
    // does this needs to tie into openCommChannel in the Environment...?
    const x = await this.ipywidgets_state.getMessage(model_id);
    if (x == null) {
      return;
    }
    const { message, buffers } = x;
    log("handleMessageChange: ", model_id, message, buffers);
    const model = await this.manager.get_model(model_id);
    // Sending DataViews is critical, e.g., it's assumed by ipycanvas
    //    https://github.com/sagemathinc/cocalc/issues/5159
    const views = buffers.map((buffer) => new DataView(buffer));
    model.trigger("msg:custom", message, views);
  };

  // [ ] TODO: maybe have to keep trying for a while until model exists!
  watchModel = async (model_id: string) => {
    if (this.watching.has(model_id)) {
      return;
    }
    // do this before anything else async, or we could end up watching it more
    // than once at a time.
    this.watching.add(model_id);
    const model = await this.manager.get_model(model_id);
    this.last_changed[model_id] = { last_changed: 0 };
    model.on("change", this.handleModelChange);
  };

  // handleModelChange is called when an ipywidgets model changes.
  // This function serializes the change and saves it to
  // ipywidgets_state, so that it is gets sync'd to the backend
  // and any other clients.
  private handleModelChange = async (model): Promise<void> => {
    const { model_id } = model;
    let changed = model.changed;
    log("handleModelChange", model_id, changed);
    await model.state_change;
    if (this.state_lock.has(model_id)) {
      log("handleModelChange: ignoring change due to state lock");
      return;
    }
    changed = model.serialize(changed);
    delete changed.children; // sometimes they are in there, but shouldn't be sync'ed.
    const { last_changed } = changed;
    delete changed.last_changed;
    if (len(changed) == 0) {
      log("handleModelChange: nothing changed");
      return; // nothing
    }
    // increment sequence number.
    changed.last_changed =
      Math.max(last_changed ?? 0, this.last_changed[model_id].last_changed) + 1;
    this.last_changed[model_id] = changed;
    log("handleModelChange", changed);
    this.ipywidgets_state.set_model_value(model_id, changed, false);
    this.ipywidgets_state.save();
  };

  private deserializeState = async (
    model: base.DOMWidgetModel,
    serialized_state: SerializedModelState,
  ): Promise<DeserializedModelState> => {
    // log("deserializeState", { model, serialized_state });
    // NOTE: this is a reimplementation of soemething in
    //     ipywidgets/packages/base/src/widget.ts
    // but we untagle unpacking and deserializing, which is
    // mixed up there.
    // This is used in an interesting way for the date picker, see:
    //     ipywidgets/packages/controls/src/widget_date.ts
    // in particular for when a date is set in the kernel.

    return await this._deserializeState(
      model.model_id,
      model.constructor,
      serialized_state,
    );
  };

  private _deserializeState = async (
    model_id: string,
    constructor: any,
    serialized_state: SerializedModelState,
  ): Promise<DeserializedModelState> => {
    //     console.log("_deserialize_state", {
    //       model_id,
    //       constructor,
    //       serialized_state,
    //     });
    const { serializers } = constructor;

    if (serializers == null) {
      return serialized_state;
    }

    // We skip deserialize if the deserialize function is unpack_model,
    // since we do our own model unpacking, due to issues with ordering
    // and RTC.
    const deserialized: DeserializedModelState = {};
    await this.setBuffers(model_id, serialized_state);
    for (const k in serialized_state) {
      const deserialize = serializers[k]?.deserialize;
      if (
        deserialize != null &&
        !is_unpack_models(deserialize) &&
        !isModelReference(serialized_state[k])
      ) {
        deserialized[k] = deserialize(serialized_state[k]);
      } else {
        deserialized[k] = serialized_state[k];
      }
    }

    return deserialized;
  };

  /*
  We do our own model dereferencing (partly replicating code in ipywidgets),
  so that models can be created in random
  order, rather than in exactly the order they are created by the kernel.
  This is important for realtime sync, multiple users, etc.

  Documention for IPY_MODEL_ reference spec:

      https://github.com/jupyter-widgets/ipywidgets/blob/master/packages/schema/jupyterwidgetmodels.v7-4.md#model-state

  TODO: there's no way I can see how to tell which values will be references,
  so we just search  everything for now, at least as a string (layout, style) or
  array of strings (children, axes, buttons).  I wish I knew that those 5 were the
  only keys to consider...  I'm also worried because what if some random value
  just happens to look like a reference?
  */

  // Returns undefined if it is not able to resolve the reference.  In
  // this case, we'll try again later after parsing everything else.
  private dereferenceModelLink = async (
    val: string,
  ): Promise<base.DOMWidgetModel | undefined> => {
    if (!isModelReference(val)) {
      throw Error(`val (="${val}") is not a model reference.`);
    }

    const model_id = val.slice(10);
    return await this.manager.get_model(model_id);
  };

  dereferenceModelLinks = async (state): Promise<boolean> => {
    // log("dereferenceModelLinks", "BEFORE", { ...state });
    for (const key in state) {
      const val = state[key];
      if (isModelReference(val)) {
        // that is a reference
        const model = await this.dereferenceModelLink(val);
        if (model != null) {
          state[key] = model;
        } else {
          return false; // something can't be resolved yet.
        }
      } else if (is_array(val)) {
        // array of stuff
        for (const i in val) {
          if (isModelReference(val[i])) {
            // this one is a string reference
            const model = await this.dereferenceModelLink(val[i]);
            if (model != null) {
              val[i] = model;
            } else {
              return false;
            }
          }
        }
      } else if (is_object(val)) {
        for (const key in val) {
          const z = val[key];
          if (isModelReference(z)) {
            const model = await this.dereferenceModelLink(z);
            if (model != null) {
              val[key] = model;
            } else {
              return false;
            }
          }
        }
      }
    }
    // log("dereferenceModelLinks", "AFTER (success)", { ...state });
    return true;
  };

  openCommChannel = async ({
    comm_id,
    target_name,
    data,
    metadata: _metadata,
    buffers,
  }: {
    comm_id: string;
    target_name: string;
    data?: JSONValue;
    metadata?: JSONValue;
    buffers?: ArrayBuffer[];
  }): Promise<IClassicComm> => {
    log("openCommChannel", { comm_id, target_name, data, buffers, _metadata });
    const { send_comm_message_to_kernel } = this.actions;

    // TODO: we do not currently have anything at all that
    // routes messages to this.
    type Handler = (x: any) => void;
    const messageHandlers: Handler[] = [];
    const closeHandlers: Handler[] = [];

    const comm = {
      comm_id,

      target_name,

      open(
        data: JSONValue,
        callbacks?: ICallbacks,
        metadata?: JSONObject,
        buffers?: ArrayBuffer[] | ArrayBufferView[],
      ): string {
        log("comm.open", { data, callbacks, metadata, buffers });
        throw Error("comm.open is not implemented");
      },

      send(
        data: JSONValue,
        callbacks?: ICallbacks,
        metadata?: JSONObject,
        buffers?: ArrayBuffer[] | ArrayBufferView[],
      ): string {
        log("comm.send", { data, buffers, metadata, callbacks });
        const msg_id = uuid();
        send_comm_message_to_kernel({
          msg_id,
          comm_id,
          target_name,
          data,
          buffers,
        });
        return msg_id;
      },

      close(
        data?: JSONValue,
        callbacks?: ICallbacks,
        metadata?: JSONObject,
        buffers?: ArrayBuffer[] | ArrayBufferView[],
      ): string {
        log("comm.close", { data, callbacks, metadata, buffers });
        throw Error("comm.close not implemented");
      },

      on_msg(callback: Handler): void {
        log("comm.on_msg -- adding a handler");
        messageHandlers.push(callback);
      },

      on_close(callback: Handler): void {
        log("comm.on_close -- adding a handler");
        closeHandlers.push(callback);
      },
    };

    if (data != null) {
      // [ ] TODO: I think we need a flag so that this is a *create* comm message...
      //     unless that just happens automatically.
      // [ ] TODO: what about metadata?
      await comm.send(data, undefined, undefined, buffers);
    }
    return comm;
  };
}

class Environment implements WidgetEnvironment {
  private manager: WidgetManager;

  constructor(manager) {
    this.manager = manager;
  }

  async loadClass(
    _className: string,
    _moduleName: string,
    _moduleVersion: string,
  ): Promise<any> {
    return;
  }

  async getSerializedModelState(model_id) {
    // log("getSerializedModelState", model_id);
    if (this.manager.ipywidgets_state.get_state() != "ready") {
      await once(this.manager.ipywidgets_state, "ready");
    }
    let state = this.manager.ipywidgets_state.getSerializedModelState(model_id);
    if (!state) {
      log("getSerializedModelState", model_id, "not yet known -- waiting");
      while (state == null) {
        await once(this.manager.ipywidgets_state, "change");
        state = this.manager.ipywidgets_state.getSerializedModelState(model_id);
      }
    }
    if (state == null) {
      throw Error("bug");
    }

    if (state._model_module == "k3d" && state.type != null) {
      while (!state?.type || !state?.id) {
        log(
          "getSerializedModelState -- k3d case",
          model_id,
          "k3d: waiting for state.type and state.id to be defined",
          {
            type: state?.type,
            id: state?.id,
          },
        );

        await once(this.manager.ipywidgets_state, "change");
        state = this.manager.ipywidgets_state.getSerializedModelState(model_id);
      }
    }
    if (state == null) {
      throw Error("bug");
    }
    if (state.hasOwnProperty("outputs") && state["outputs"] == null) {
      // It can definitely be 'undefined' but set, e.g., the 'out.clear_output()' example at
      // https://ipywidgets.readthedocs.io/en/latest/examples/Output%20Widget.html
      // causes this, which then totally breaks rendering (due to how the
      // upstream widget manager works).  This works around that.
      state["outputs"] = [];
    }
    const { buffer_paths, buffers } =
      await this.manager.ipywidgets_state.getModelBuffers(model_id);

    if (buffers.length > 0) {
      for (let i = 0; i < buffer_paths.length; i++) {
        const buffer = buffers[i];
        setInObject(state, buffer_paths[i], new DataView(buffer));
      }
    }

    log("getSerializedModelState", { model_id, state });
    setTimeout(() => this.manager.watchModel(model_id), 1);

    if (state._model_module == "k3d") {
      if (state.object_ids != null) {
        while (!isSubset(state.object_ids, this.manager.k3dObjectIds)) {
          log("k3d -- waiting for object_ids", state.object_ids);
          await delay(K3D_DELAY_MS);
        }
      }
      if (state.id != null) {
        this.manager.k3dObjectIds.add(state.id);
      }
    }

    return {
      modelName: state._model_name,
      modelModule: state._model_module,
      modelModuleVersion: state._model_module_version,
      state,
    };
  }

  async openCommChannel(opts) {
    log("Environment: openCommChannel", opts);
    return await this.manager.openCommChannel(opts);
  }

  async renderOutput(outputItem: any, destination: Element): Promise<void> {
    // the gaussian plume notebook has example of this!
    log("renderOutput", { outputItem, destination });
    if (outputItem == null) {
      return;
    }
    const message = fromJS(outputItem);
    const myDiv = document.createElement("div");
    destination.appendChild(myDiv);
    const { actions } = this.manager;
    const { project_id, path } = actions;
    // NOTE: we are NOT caching iframes here, so iframes in output
    // widgets will refresh if you scroll them off the screen and back.
    const trust = actions.store.get("trust");
    const component = React.createElement(
      FrameContext.Provider,
      {
        // @ts-ignore -- we aren't filling in all the standard stuff
        // also we just always put isVisible true, since the output widget itself
        // (which has proper context) gets not rendered and that contains this.
        value: { isVisible: true, project_id, path },
      },
      React.createElement(
        FileContext.Provider,
        {
          value: {
            noSanitize: trust,
            project_id,
            path,
            // see https://github.com/sagemathinc/cocalc/issues/5258
            AnchorTagComponent: getAnchorTagComponent({ project_id, path }),
          },
        },
        React.createElement(
          CellOutputMessage,
          { message, actions, project_id, trust },
          null,
        ),
      ),
    );
    const root = ReactDOM.createRoot(myDiv);
    root.render(component);
  }
}

import { WidgetModel } from "@jupyter-widgets/base";
// We do our own sync, but backbone calls this.
WidgetModel.prototype.sync = () => {};
// WidgetModel.prototype.sync = (method, model, options) => {
//   console.log("WidgetModel.sync ", { method, model, options });
// };

// We modify the upstream version from
// ipywidgets/packages/base/src/utils.ts
// to be non-fatal, so it's more flexible wrt to our realtime sync setup.
export function put_buffers(
  state,
  buffer_paths: string[][],
  buffers: any[],
): void {
  for (let i = 0; i < buffer_paths.length; i++) {
    const buffer_path = buffer_paths[i];
    // make sure the buffers are DataViews
    let buffer = buffers[i];
    if (!(buffer instanceof DataView)) {
      buffer = new DataView(
        buffer instanceof ArrayBuffer ? buffer : buffer.buffer,
      );
    }
    setInObject(state, buffer_path, buffer);
  }
}

function setInObject(obj: any, path: string[], value: any) {
  // say we want to set obj[x][y][z] = value
  // we first get obj = state[x][y]
  for (let j = 0; j < path.length - 1; j++) {
    if (obj[path[j]] == null) {
      // doesn't exist, so create it.  This makes things work in
      // possibly more random order, rather than crashing.  I hit this,
      // e.g., when defining animations for k3d.
      obj[path[j]] = {};
    }
    obj = obj[path[j]];
  }
  // and then set: obj[z] = value
  obj[path[path.length - 1]] = value;
}

const IPY_MODEL = "IPY_MODEL_";
function isModelReference(value): boolean {
  return typeof value == "string" && value.startsWith(IPY_MODEL);
}

function isSubset(X, Y) {
  for (const a of X) {
    if (!Y.has(a)) {
      return false;
    }
  }
  return true;
}
