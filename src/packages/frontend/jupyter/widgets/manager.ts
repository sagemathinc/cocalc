/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as base from "@jupyter-widgets/base";
import * as phosphor_controls from "@jupyter-widgets/controls";
import {
  IpywidgetsState,
  ModelState,
} from "@cocalc/sync/editor/generic/ipywidgets-state";
import { once } from "@cocalc/util/async-utils";
import { Comm } from "./comm";
import { copy, is_array, is_object, len, uuid } from "@cocalc/util/misc";
import * as react_output from "./output";
import * as react_controls from "./controls";
import { size } from "lodash";
import { delay } from "awaiting";

///////
// Third party custom widgets:
// I rewrote the entire k3d widget interface...
import * as k3d from "./k3d";

// pythreejs: fails miserably
//import * as jupyter_threejs from "jupyter-threejs";

// ipyvolume: fails miserably
// import * as ipyvolume from "ipyvolume/dist";

// bqplot: totally fails
// simple examples don't really use widgets, but the big notebook
// linked at https://github.com/bqplot/bqplot does
// This actually currently half way works. The plot appears, but
// things instantly get squished, and buttons don't work.  But it's close.
// To develop it, I switched to import "bqplot" instead of "bqplot/dist",
// and also (!) had to install the exact same random version of d3 that
// is needed by bqplot (since webpack grabs it rather than the one in bqplot).
// Also, it's necessary to install raw-loader into packages/frontend to
// do such dev work.
// import * as bqplot from "bqplot/dist";

// matplotlib:
// This just silently fails when I've tried it.
// There's also warning by webpack about a map file missing. They are harmless.
// import * as matplotlib from "jupyter-matplotlib";

//////

export type SendCommFunction = (string, data) => string;

export class WidgetManager extends base.ManagerBase<HTMLElement> {
  private ipywidgets_state: IpywidgetsState;
  private widget_model_ids_add: Function;
  private incomplete_model_ids: Set<string> = new Set();
  private last_changed: { [model_id: string]: { [key: string]: any } } = {};
  private state_lock: Set<string> = new Set();

  // widget_model_ids_add gets called after each model is created.
  // This makes it so UI that is waiting on comm state so it
  // can render will try again.
  constructor(
    ipywidgets_state: IpywidgetsState,
    widget_model_ids_add: Function
  ) {
    super();
    this.ipywidgets_state = ipywidgets_state;
    if (this.ipywidgets_state.get_state() == "closed") {
      throw Error("ipywidgets_state must not be closed");
    }
    this.widget_model_ids_add = widget_model_ids_add;
    this.init_ipywidgets_state();
  }

  private async init_ipywidgets_state(): Promise<void> {
    if (this.ipywidgets_state.get_state() != "ready") {
      // wait until ready to use.
      await once(this.ipywidgets_state, "ready");
    }

    // Now process all info currently in the table.
    this.handle_table_state_change(this.ipywidgets_state.keys());

    this.ipywidgets_state.on(
      "change",
      this.handle_table_state_change.bind(this)
    );
  }

  private async handle_table_state_change(keys): Promise<void> {
    //console.log("handle_table_state_change", keys);
    for (const key of keys) {
      const [, model_id, type] = JSON.parse(key);
      // console.log("handle_table_state_change - one key", key, model_id, type);
      switch (type) {
        case "state":
          await this.handle_table_model_state_change(model_id);
          break;
        case "value":
          await this.handle_table_model_value_change(model_id);
          break;
        case "buffers":
          await this.handle_table_model_buffers_change(model_id);
          break;
        case "message":
          this.handle_table_model_message_change(model_id);
          break;
        default:
          throw Error(`unknown state type '${type}'`);
      }
    }
    while (this.incomplete_model_ids.size > 0) {
      const size_before = this.incomplete_model_ids.size;
      for (const model_id of this.incomplete_model_ids) {
        await this.handle_table_model_state_change(model_id);
      }
      if (this.incomplete_model_ids.size >= size_before) {
        // no shrink -- avoid infinite loop; will try after next change.
        return;
      }
    }
  }

  private async handle_table_model_state_change(
    model_id: string
  ): Promise<void> {
    const state: ModelState | undefined =
      this.ipywidgets_state.get_model_state(model_id);
    if (state == null) {
      // nothing to do...
      return;
    }

    const model = await this.get_model(model_id);
    if (model == null) {
      // create model
      await this.create_new_model(model_id, state);
      // possibly deal with buffers...
      await this.handle_table_model_buffers_change(model_id);
    } else {
      await this.update_model(model_id, state);
    }
  }

  private async handle_table_model_value_change(
    model_id: string
  ): Promise<void> {
    const changed = this.ipywidgets_state.get_model_value(model_id);
    // console.log("handle_table_model_value_change", model_id, changed);
    if (
      this.last_changed[model_id] != null &&
      changed.last_changed != null &&
      changed.last_changed <= this.last_changed[model_id].last_changed
    ) {
      /* console.log(
        "skipping due to last change time",
        this.last_changed[model_id],
        changed.last_changed
      ); */
      if (changed.last_changed < this.last_changed[model_id].last_changed) {
        // console.log("strict inequality, so saving again");
        // This is necessary since SyncTable has fairly week guarantees
        // when you try to write tons of changing rapidly to the *same*
        // key (in this case the value). SyncTable was mainly designed
        // for lots of different keys (without changes), as comes up
        // with file editing where you're storing a log.  It's also fine
        // for changing a single key NOT rapidly.
        this.ipywidgets_state.set_model_value(
          model_id,
          this.last_changed[model_id]
        );
        this.ipywidgets_state.save();
      }
      return;
    }
    if (changed.last_changed != null) {
      this.last_changed[model_id] = changed;
    }
    this.state_lock.add(model_id);
    await this.update_model(model_id, changed);
    const model = await this.get_model(model_id);
    if (model != null) {
      await model.state_change;
    }
    this.state_lock.delete(model_id);
  }

  // Mutate state to account for any buffers.  We have to do
  // this any time we update the model via the update_model
  // function; otherwise the state that is getting sync'd around
  // between clients will just forget the buffers that are set
  // via handle_table_model_buffers_change!
  private setBuffers(model_id: string, state: ModelState): void {
    const { buffer_paths, buffers } =
      this.ipywidgets_state.get_model_buffers(model_id);
    if (buffer_paths.length == 0) return; // nothing to do
    // convert each buffer in buffers to a DataView.
    const paths: string[][] = [];
    const vals: any[] = [];
    for (let i = 0; i < buffers.length; i++) {
      if (state[buffer_paths[i][0]] == null) {
        continue;
      }
      vals.push(new DataView(new Uint8Array(buffers[i].data).buffer));
      paths.push(buffer_paths[i]);
    }
    put_buffers(state, paths, vals);
  }

  private async handle_table_model_buffers_change(
    model_id: string
  ): Promise<void> {
    /*
    The data structures currently don't store which buffers changed, so we're
    updating all of them before, which is of course wildly inefficient.

    We definitely do have to serialize, then pass to update_model, so that
    the widget can properly deserialize again, as I learned with k3d, which
    processes everything.
    */
    const model = await this.get_model(model_id);
    if (model == null) return;
    const { buffer_paths } = this.ipywidgets_state.get_model_buffers(model_id);
    const deserialized_state = model.get_state(true);
    const serializers = (model.constructor as any).serializers;
    const change: { [key: string]: any } = {};
    for (const paths of buffer_paths) {
      const key = paths[0];
      change[key] =
        serializers[key]?.serialize(deserialized_state[key]) ??
        deserialized_state[key];
    }
    this.update_model(model_id, change);
  }

  private async handle_table_model_message_change(
    model_id: string
  ): Promise<void> {
    const message = this.ipywidgets_state.get_message(model_id);
    if (size(message) == 0) return; // temporary until we have delete functionality
    // console.log("handle_table_model_message_change", message);
    const model = await this.get_model(model_id);
    if (model == null) return;
    model.trigger("msg:custom", message);
  }

  deserialize_state(
    model: base.DOMWidgetModel,
    serialized_state: ModelState
  ): ModelState {
    // console.log("deserialize_state", { model, serialized_state });
    // NOTE: this is a reimplementation of soemething in
    //     ipywidgets/packages/base/src/widget.ts
    // but we untagle unpacking and deserializing, which is
    // mixed up there.
    // This is used in an interesting way for the date picker, see:
    //     ipywidgets/packages/controls/src/widget_date.ts
    // in particular for when a date is set in the kernel.

    return this._deserialize_state(
      model.model_id,
      model.constructor,
      serialized_state
    );
  }

  private _deserialize_state(
    model_id: string,
    constructor: any,
    serialized_state: ModelState
  ): ModelState {
    //     console.log("_deserialize_state", {
    //       model_id,
    //       constructor,
    //       serialized_state,
    //     });
    const { serializers } = constructor;

    if (serializers == null) return serialized_state;

    // We skip deserialize if the deserialize function is unpack_model,
    // since we do our own model unpacking, due to issues with ordering
    // and RTC.
    const deserialized: ModelState = {};
    this.setBuffers(model_id, serialized_state);
    for (const k in serialized_state) {
      const deserialize = serializers[k]?.deserialize;
      if (deserialize != null && deserialize !== base.unpack_models) {
        deserialized[k] = deserialize(serialized_state[k]);
      } else {
        deserialized[k] = serialized_state[k];
      }
    }

    return deserialized;
  }

  private async update_model(
    model_id: string,
    change: ModelState
  ): Promise<void> {
    const model: base.DOMWidgetModel | undefined = await this.get_model(
      model_id
    );
    // console.log("update_model", { model, change });
    if (model != null) {
      //console.log(`setting state of model "${model_id}" to `, change);
      if (change.last_changed != null) {
        this.last_changed[model_id] = change;
      }
      const success = await this.dereference_model_links(change);
      if (!success) {
        console.warn(
          "update model suddenly references not known models -- can't handle this yet (TODO!); ignoring update."
        );
        return;
      }
      const state = this.deserialize_state(model, change);
      model.set_state(state);
      // } else {
      // console.warn(`WARNING: update_model -- unknown model ${model_id}`);
    }
  }

  // I rewrote _make_model based on an old version I found (instead of master),
  // since I figured that was more likely to work with the rest of the code and
  // with widgets-in-the-wild, since the released ipywidgets that all widgets target
  // it kind of massively different than what is in master.
  async _make_model(
    options,
    serialized_state: any = {}
  ): Promise<base.WidgetModel> {
    const model_id = options.model_id;
    let ModelType: typeof base.WidgetModel;
    try {
      ModelType = await this.loadClass(
        options.model_name,
        options.model_module,
        options.model_module_version
      );
    } catch (error) {
      console.warn("Could not load widget module");
      throw error;
    }

    if (!ModelType) {
      throw new Error(
        `Cannot find model module ${options.model_module}@${options.model_module_version}, ${options.model_name}`
      );
    }

    const state = this._deserialize_state(
      model_id,
      ModelType,
      serialized_state
    );

    // TODO: this is silly, of course!!
    for (let i = 0; i < 5; i++) {
      const isDereferenced = await this.dereference_model_links(state);
      if (isDereferenced) break;
      console.warn("dereference_model -- still not done", state);
      await delay(250);
      if (i == 2) {
        console.log("giving up");
        await delay(10000000);
      }
    }

    const modelOptions = {
      widget_manager: this,
      model_id: model_id,
      comm: options.comm,
    };
    const widget_model = new ModelType(state, modelOptions);
    widget_model.name = options.model_name;
    widget_model.module = options.model_module;
    return widget_model;
  }

  private async create_new_model(
    model_id: string,
    serialized_state: any
  ): Promise<void> {
    // console.log("create_new_model", { model_id, serialized_state });
    if ((await this.get_model(model_id)) != null) {
      // already created -- shouldn't happen?
      return;
    }

    if (serialized_state == null) {
      throw Error("serialized_state must be set");
    }

    const model_name: string | undefined = serialized_state._model_name;
    if (model_name == null) {
      throw Error("_model_name must be defined");
    }
    const model_module: string | undefined = serialized_state._model_module;
    if (model_module == null) {
      throw Error("_model_module must be defined");
    }
    const model_module_version: string | undefined =
      serialized_state._model_module_version;
    if (model_module_version == null) {
      throw Error("_model_module_version must be defined");
    }

    const model: base.DOMWidgetModel = await this.new_model(
      {
        model_module,
        model_name,
        model_id,
        model_module_version,
      },
      serialized_state
    );

    const success = await this.dereference_model_links(serialized_state);
    if (!success) {
      //console.log(model_id, "failed to dereference fully");
      this.incomplete_model_ids.add(model_id);
      return;
    } else {
      //console.log(model_id, "successful full dereference");
      this.incomplete_model_ids.delete(model_id);
    }

    // Model is NOT an EventEmitter.  It is a backbone.js thing,
    // and browsing the source code of backbone, I learned that
    // "all" is an alias for listening to all events, which is
    // useful for debugging:
    //model.on("all", console.log);

    // Initialize the model -- should include layout/style ?
    const state = this.deserialize_state(model, serialized_state);
    model.set(state);

    // Start listening to model changes.
    model.on("change", this.handle_model_change.bind(this));

    // Inform CoCalc/React client that we just created this model.
    this.widget_model_ids_add(model_id);
  }

  public display_view(_msg, _view, _options): Promise<HTMLElement> {
    throw Error("display_view not implemented");
  }

  // Create a comm -- I think THIS IS NOT USED AT ALL...?
  async _create_comm(
    target_name: string,
    model_id: string,
    _data?: any,
    _metadata?: any
  ): Promise<Comm> {
    const comm = new Comm(
      target_name,
      model_id,
      this.process_comm_message_from_browser.bind(this)
    );
    return comm;
  }

  // TODO: NOT USED since we just directly listen for change events on the model.
  private process_comm_message_from_browser(
    model_id: string,
    data: any
  ): string {
    //console.log("TODO: process_comm_message_from_browser", model_id, data);
    if (data == null) {
      throw Error("data must not be null");
    }
    if (data.method == "update") {
      const state = data.state;
      if (state == null) {
        throw Error("state must not be null");
      }
      this.ipywidgets_state.set_model_value(model_id, state.value);
      this.ipywidgets_state.save();
    } else {
      throw Error(
        `TODO: process_comm_message_from_browser with method '${data.method}' not implemented`
      );
    }
    return uuid();
  }

  private async handle_model_change(model: base.DOMWidgetModel): Promise<void> {
    const model_id = model.model_id;
    await model.state_change;
    if (this.state_lock.has(model_id)) {
      /* console.log(
        "handle_model_change (frontend) -- skipping due to state lock",
        model_id
      );*/
      return;
    }
    const changed: any = copy(model.serialize(model.changed));
    delete changed.children; // sometimes they are in there, but shouldn't be sync'ed.
    // console.log("handle_model_change (frontend)", changed);
    const last_changed = changed.last_changed;
    delete changed.last_changed;
    if (len(changed) == 0) {
      // console.log("handle_model_change (frontend) -- NOTHING changed");
      return; // nothing
    }
    // increment sequence number.
    changed.last_changed =
      Math.max(
        last_changed ? last_changed : 0,
        this.last_changed[model_id] != null
          ? this.last_changed[model_id].last_changed
          : 0
      ) + 1;
    this.last_changed[model_id] = changed;
    // console.log("handle_model_change (frontend) -- actually saving", changed);
    this.ipywidgets_state.set_model_value(model_id, changed, true);
    this.ipywidgets_state.save();

    //     const serialized_changed = this.serialize_state(model, changed);
    //     console.log("handle_model_change (frontend) -- actually saving", {
    //       changed,
    //       serialized_changed,
    //     });
    //     this.ipywidgets_state.set_model_value(model_id, serialized_changed, true);
    //     this.ipywidgets_state.save();
  }

  // Get the currently-registered comms.
  async _get_comm_info(): Promise<any> {
    // console.log(`TODO: _get_comm_info`);
    throw Error("_get_comm_info not implemented");
    //return {};
  }

  async loader(): Promise<any> {
    throw Error("loader not implemented");
  }

  // Load a class and return a promise to the loaded object.
  protected async loadClass(
    className: string,
    moduleName: string,
    moduleVersion: string
  ): Promise<any> {
    // console.log("loadClass", { className, moduleName, moduleVersion });
    let module: any;
    if (moduleName === "@jupyter-widgets/base") {
      module = base;
    } else if (moduleName === "@jupyter-widgets/controls") {
      if (react_controls[className] != null) {
        module = react_controls;
      } else {
        module = phosphor_controls;
      }
    } else if (moduleName === "@jupyter-widgets/output") {
      module = react_output;
    } else if (moduleName === "k3d") {
      module = k3d;
    } else if (moduleName === "jupyter-matplotlib") {
      throw Error(`custom widgets: ${moduleName} not installed`);
      // module = matplotlib;
    } else if (moduleName === "jupyter-threejs") {
      throw Error(`custom widgets: ${moduleName} not installed`);
      // module = jupyter_threejs;
    } else if (moduleName === "ipyvolume") {
      throw Error(`custom widgets: ${moduleName} not installed`);
      // module = ipyvolume;
    } else if (moduleName === "bqplot") {
      throw Error(`custom widgets: ${moduleName} not installed`);
      // module = bqplot;
    } else if (this.loader !== undefined) {
      console.warn(
        `TODO -- unsupported ${className}, ${moduleName}, ${moduleVersion}`
      );
      module = { [className]: react_controls.UnsupportedModel };
    } else {
      console.warn(
        `TODO -- unsupported ${className}, ${moduleName}, ${moduleVersion}`
      );
      module = { [className]: react_controls.UnsupportedModel };
    }
    if (module[className]) {
      return module[className];
    } else {
      throw Error(
        `Class ${className} not found in module ${moduleName}@${moduleVersion}`
      );
    }
  }

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
  private async dereference_model_link(
    val: string
  ): Promise<base.DOMWidgetModel | undefined> {
    if (val.slice(0, 10) !== "IPY_MODEL_") {
      throw Error(`val (="${val}") is not a model reference.`);
    }

    const model_id = val.slice(10);
    return await this.get_model(model_id);
  }

  private async dereference_model_links(state): Promise<boolean> {
    // console.log("dereference_model_links", "BEFORE", state);
    for (const key in state) {
      const val = state[key];
      if (typeof val === "string") {
        // single string
        if (val.slice(0, 10) === "IPY_MODEL_") {
          // that is a reference
          const model = await this.dereference_model_link(val);
          if (model != null) {
            state[key] = model;
          } else {
            return false; // something can't be resolved yet.
          }
        }
      } else if (is_array(val)) {
        // array of stuff
        for (const i in val) {
          if (
            typeof val[i] === "string" &&
            val[i].slice(0, 10) === "IPY_MODEL_"
          ) {
            // this one is a string reference
            const model = await this.dereference_model_link(val[i]);
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
          if (typeof z == "string" && z.slice(0, 10) == "IPY_MODEL_") {
            const model = await this.dereference_model_link(z);
            if (model != null) {
              val[key] = model;
            } else {
              return false;
            }
          }
        }
      }
    }
    // console.log("dereference_model_links", "AFTER (success)", state);
    return true;
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
  buffer_paths: (string | number)[][],
  buffers: any[]
): void {
  for (let i = 0; i < buffer_paths.length; i++) {
    const buffer_path = buffer_paths[i];
    // make sure the buffers are DataViews
    let buffer = buffers[i];
    if (!(buffer instanceof DataView)) {
      buffer = new DataView(
        buffer instanceof ArrayBuffer ? buffer : buffer.buffer
      );
    }
    // say we want to set state[x][y][z] = buffer
    let obj = state as any;
    // we first get obj = state[x][y]
    for (let j = 0; j < buffer_path.length - 1; j++) {
      if (obj[buffer_path[j]] == null) {
        // doesn't exist, so create it.  This makes things work in
        // possibly more random order, rather than crashing.  I hit this,
        // e.g., when defining animations for k3d.
        obj[buffer_path[j]] = {};
      }
      obj = obj[buffer_path[j]];
    }
    // and then set: obj[z] = buffer
    obj[buffer_path[buffer_path.length - 1]] = buffer;
  }
}
