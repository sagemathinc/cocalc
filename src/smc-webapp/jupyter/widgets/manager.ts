/*


*/

import * as base from "@jupyter-widgets/base";
import * as phosphor_controls from "@jupyter-widgets/controls";
import {
  IpywidgetsState,
  ModelState
} from "smc-util/sync/editor/generic/ipywidgets-state";
import { once } from "smc-util/async-utils";
import { Comm } from "./comm";
import { is_array, uuid } from "smc-util/misc2";

import * as react_output from "./output";
import * as react_controls from "./controls";

export type SendCommFunction = (string, data) => string;

export class WidgetManager extends base.ManagerBase<HTMLElement> {
  private ipywidgets_state: IpywidgetsState;
  private widget_model_ids_add: Function;
  private incomplete_model_ids: Set<string> = new Set();

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
    // console.log("handle_table_state_change", keys);
    for (let key of keys) {
      const [, model_id, type] = JSON.parse(key);
      // console.log("handle_table_state_change - one key", key, model_id, type);
      switch (type) {
        case "state":
          await this.handle_model_state_change(model_id);
          break;
        case "value":
          await this.handle_model_value_change(model_id);
          break;
        default:
          throw Error(`unknown state type '${type}'`);
      }
    }
    while (this.incomplete_model_ids.size > 0) {
      const size_before = this.incomplete_model_ids.size;
      for (let model_id of this.incomplete_model_ids) {
        await this.handle_model_state_change(model_id);
      }
      if (this.incomplete_model_ids.size >= size_before) {
        // no shrink -- avoid infinite loop; will try after next change.
        return;
      }
    }
  }

  private async handle_model_state_change(model_id: string): Promise<void> {
    const state: ModelState | undefined = this.ipywidgets_state.get_model_state(
      model_id
    );
    if (state == null) {
      // nothing to do...
      return;
    }

    const model: base.DOMWidgetModel = await this.get_model(model_id);
    if (model == null) {
      // create model
      await this.create_new_model(model_id, state);
    } else {
      await this.update_model(model_id, state);
    }
  }

  private async handle_model_value_change(model_id: string): Promise<void> {
    const changed = this.ipywidgets_state.get_model_value(model_id);
    console.log("handle_model_value_change", model_id, changed);
    await this.update_model(model_id, changed);
  }

  private async update_model(
    model_id: string,
    state: ModelState
  ): Promise<void> {
    const model: base.DOMWidgetModel | undefined = await this.get_model(
      model_id
    );
    if (model != null) {
      //console.log(`setting state of model "${model_id}" to `, state);
      const success = await this.dereference_model_links(state);
      if (!success) {
        console.warn(
          "update model suddenly references not known models -- can't handle this yet (TODO!); ignoring update."
        );
        return;
      }
      model.set_state(state);
      // } else {
      // console.warn(`WARNING: update_model -- unknown model ${model_id}`);
    }
  }

  private async create_new_model(model_id: string, state: any): Promise<void> {
    if ((await this.get_model(model_id)) != null) {
      // already created -- shouldn't happen?
      return;
    }

    if (state == null) {
      throw Error("state must be set");
    }

    const view_name: string | undefined = state._view_name;
    if (view_name == null) {
      throw Error("_view_name must be defined");
    }
    const view_module: string | undefined = state._view_module;
    if (view_module == null) {
      throw Error("_view_module must be defined");
    }
    const view_module_version: string | undefined = state._view_module_version;
    if (view_module_version == null) {
      throw Error("_view_module_version must be defined");
    }
    const model_name: string | undefined = state._model_name;
    if (model_name == null) {
      throw Error("_model_name must be defined");
    }
    const model_module: string | undefined = state._model_module;
    if (model_module == null) {
      throw Error("_model_module must be defined");
    }
    const model_module_version: string | undefined =
      state._model_module_version;
    if (model_module_version == null) {
      throw Error("_model_module_version must be defined");
    }

    const success = await this.dereference_model_links(state);
    //console.log(model_id, view_module, view_name, view_module_version);

    if (!success) {
      //console.log(model_id, "failed to dereference fully");
      this.incomplete_model_ids.add(model_id);
      return;
    } else {
      //console.log(model_id, "successful full dereference");
      this.incomplete_model_ids.delete(model_id);
    }

    const model: base.DOMWidgetModel = await this.new_model({
      model_module,
      model_name,
      model_id,
      model_module_version
    });

    // Initialize the model
    model.set(state);

    // Start listing to model changes.
    model.on("change", this.handle_model_change.bind(this));

    // Inform CoCalc/React client that we just created this model.
    this.widget_model_ids_add(model_id);
  }

  public display_view(_msg, _view, _options): Promise<HTMLElement> {
    throw Error("display_view not implemented");
  }

  // Create a comm -- THIS IS NOT USED AT ALL
  async _create_comm(
    target_name: string,
    model_id: string,
    data?: any,
    metadata?: any
  ): Promise<Comm> {
    console.log(`_create_comm(${target_name}, ${model_id}`, data, metadata);
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
        `TODO: process_comm_message_from_browser with method '${
          data.method
        }' not implemented`
      );
    }
    return uuid();
  }

  private async handle_model_change(model: base.DOMWidgetModel): Promise<void> {
    await model.state_change;
    delete (model.changed as any).children;  // sometimes they are in there, but shouldn't be sync'ed.
    console.log("handle_model_change (frontend)", model.changed);
    this.ipywidgets_state.set_model_value(model.model_id, model.changed);
    this.ipywidgets_state.save();
  }

  // Get the currently-registered comms.
  async _get_comm_info(): Promise<any> {
    console.log(`TODO: _get_comm_info`);
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
    // console.log("loadClass", className, moduleName, moduleVersion);
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
    } else if (this.loader !== undefined) {
      throw Error("TODO -- no clue -- maybe can't support?");
    } else {
      throw Error(`Could not load module ${moduleName}@${moduleVersion}`);
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
  so we just search from everything for now, at least as a string (layout, style) or
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
    for (let key in state) {
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
        for (let i in val) {
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
      }
    }
    return true;
  }
}
