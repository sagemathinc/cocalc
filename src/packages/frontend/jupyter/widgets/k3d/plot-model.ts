import { DOMWidgetModel } from "@jupyter-widgets/base";
import { version } from "k3d/dist/standalone";

export default class PlotModel extends DOMWidgetModel {
  defaults() {
    return {
      ...super.defaults(),
      _model_name: "PlotModel",
      _view_name: "PlotView",
      _model_module: "k3d",
      _view_module: "k3d",
      _model_module_version: version,
      _view_module_version: version,
    };
  }
}
