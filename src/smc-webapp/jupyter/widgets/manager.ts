import * as base from "@jupyter-widgets/base";
import * as controls from "@jupyter-widgets/controls";
import {
  IpywidgetsState,
  ModelState
} from "smc-util/sync/editor/generic/ipywidgets-state";
import { once } from "smc-util/async-utils";
import { Comm } from "./comm";
import { uuid } from "smc-util/misc2";

export type SendCommFunction = (string, data) => string;

export class WidgetManager extends base.ManagerBase<HTMLElement> {
  private ipywidgets_state: IpywidgetsState;
  private widget_model_ids_add: Function;

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
    console.log("handle_table_state_change", keys);
    for (let key of keys) {
      const [, model_id, type] = JSON.parse(key);
      console.log("handle_table_state_change - one key", key, model_id, type);
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
    const value = this.ipywidgets_state.get_model_value(model_id);
    console.log("handle_model_value_change", model_id, value);
    await this.update_model(model_id, { value });
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
      model.set_state(state);
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

    await this.new_widget(
      {
        model_id,
        view_module,
        view_name,
        view_module_version,
        model_module,
        model_name,
        model_module_version
      },
      state
    );

    // Inform CoCalc/React client that we just created this model.
    this.widget_model_ids_add(model_id);
  }

  public display_view(_msg, _view, _options): Promise<HTMLElement> {
    throw Error("display_view not implemented");
  }

  // Create a comm.
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

  private process_comm_message_from_browser(
    model_id: string,
    data: any
  ): string {
    console.log("TODO: process_comm_message_from_browser", model_id, data);
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
      module = controls;
    } else if (moduleName === "@jupyter-widgets/output") {
      throw Error("TODO -- will involve our react code");
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
}
