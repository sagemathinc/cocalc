import * as base from "@jupyter-widgets/base";
import * as controls from "@jupyter-widgets/controls";
import * as pWidget from "@phosphor/widgets";

import { IpywidgetsState } from "smc-util/sync/editor/generic/ipywidgets-state";
import { once } from "smc-util/async-utils";

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
    this.widget_model_ids_add = widget_model_ids_add;
    if (this.ipywidgets_state.get_state() == "closed") {
      throw Error("ipywidgets_state must not be closed");
    }
    this.init_ipywidgets_state();
  }

  private async init_ipywidgets_state(): Promise<void> {
    if (this.ipywidgets_state.get_state() != "ready") {
      // wait until ready to use.
      await once(this.ipywidgets_state, "ready");
    }
    // Handle any messages already there.
    for (let message of this.ipywidgets_state.get_messages()) {
      await this.handle_message(message);
    }

    // Starting handling any messages that arrive henceforth.
    // TODO: do we want to handle only message at a time?  Probably.
    this.ipywidgets_state.on("message", this.handle_message.bind(this));
  }

  private async handle_message(message): Promise<void> {
    // console.log("handle_message", message);
    try {
      if (message == null) {
        return;
      }
      if (message.target_name === "jupyter.widget") {
        // handle creation of a widget.
        await this.process_new_widget_message(message);
        return;
      }

      const data = message.data;
      if (data == null) {
        // nothing to do?
        console.warn("handle_message --- message.data = null?", message);
        return;
      }
      if (data.method === "update") {
        // TODO: what about data.buffer_paths?
        await this.update_model(message.comm_id, data.state);
        return;
      }
      console.warn("handle_message --- UNHANDLED ", message);
    } catch (err) {
      console.trace();
      console.log("ERROR handling message", message, err);
    }
  }

  private async update_model(model_id: string, state: object): Promise<void> {
    const model: base.DOMWidgetModel = await this.get_model(model_id);
    //console.log(`setting state of model "${model_id}" to `, state);
    model.set_state(state);
  }

  private async process_new_widget_message(message): Promise<void> {
    const model_id: string | undefined = message.comm_id;
    if (model_id == null) {
      throw Error("comm_id must be defined");
    }
    if ((await this.get_model(model_id)) != null) {
      // already created.
      return;
    }

    const data = message.data;
    if (data == null) {
      throw Error("data must be set");
    }

    const state = data.state;
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
  ): Promise<base.shims.services.Comm> {
    console.log(
      `TODO: _create_comm(${target_name}, ${model_id}`,
      data,
      metadata
    );
    throw Error("_create_comm not implemented");
    //return await new base.shims.services.Comm({} as Kernel.IComm); // TODO
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

(window as any).widgets = { base, pWidget, WidgetManager };
