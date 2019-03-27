import * as base from "@jupyter-widgets/base";
import * as controls from "@jupyter-widgets/controls";
import * as pWidget from "@phosphor/widgets";
import { Kernel } from "@jupyterlab/services";

export class WidgetManager extends base.ManagerBase<HTMLElement> {
  private element: HTMLElement;

  constructor(element: HTMLElement) {
    super();
    this.element = element;
  }

  display_view(msg, view, options) {
    console.log("display_view", msg, view, options);
    return Promise.resolve(view).then(view => {
      pWidget.Widget.attach(view.pWidget, this.element);
      view.on("remove", function() {
        console.log("view removed", view);
      });
      return view;
    });
  }

  // Create a comm.
  async _create_comm(
    target_name: string,
    model_id: string,
    data?: any,
    metadata?: any
  ): Promise<base.shims.services.Comm> {
    console.log(
      `TODO: _create_comm(${target_name}, ${model_id}, ${data}, ${metadata})`
    );
    return await new base.shims.services.Comm({} as Kernel.IComm); // TODO
  }

  // Get the currently-registered comms.
  async _get_comm_info(): Promise<any> {
    console.log(`TODO: _get_comm_info`);
    return {};
  }

  async loader(): Promise<any> {
    return {};
  }

  // Load a class and return a promise to the loaded object.
  protected async loadClass(
    className: string,
    moduleName: string,
    moduleVersion: string
  ): Promise<any> {
    console.log("loadClass", className, moduleName, moduleVersion);
    if (moduleName === "@jupyter-widgets/base") {
      return base;
    } else if (moduleName === "@jupyter-widgets/controls") {
      return controls;
    } else if (moduleName === "@jupyter-widgets/output") {
      throw Error("TODO -- will involve our react code");
    } else if (this.loader !== undefined) {
      throw Error("TODO -- no clue -- maybe can't support?");
    } else {
      throw Error(`Could not load module ${moduleName}@${moduleVersion}`);
    }
  }
}

(window as any).widgets = { base, pWidget, WidgetManager };
