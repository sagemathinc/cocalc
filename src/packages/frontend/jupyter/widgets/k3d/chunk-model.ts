import { ISerializers, WidgetModel } from "@jupyter-widgets/base";
import { serialize, version } from "k3d/dist/standalone";
import { runOnEveryPlot } from "./util";
import { chunks, objects } from "./state";

export default class ChunkModel extends WidgetModel {
  defaults() {
    return {
      ...super.defaults(),
      _model_name: "ChunkModel",
      _model_module: "k3d",
      _model_module_version: version,
    };
  }

  initialize(...args) {
    super.initialize.apply(this, args);
    this.on("change", this._change, this);
  }

  set(...args) {
    if (args[0].id != null) {
      chunks[args[0].id] = this;
    }
    super.set.apply(this, args);
  }

  _change() {
    const chunk = this.attributes;
    for (const id in objects) {
      if (objects[id].attributes.type === "VoxelsGroup") {
        runOnEveryPlot(objects[id].attributes.id, (_, objInstance) => {
          objInstance.updateChunk(chunk);
        });
      }
    }
  }

  static serializers: ISerializers = {
    ...WidgetModel.serializers,
    voxels: serialize,
    coord: serialize,
  };
}
