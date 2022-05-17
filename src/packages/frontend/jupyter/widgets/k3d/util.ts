import { plots } from "./state";

export function runOnEveryPlot(id: string, cb: Function): void {
  for (const plot of plots) {
    if (plot.model.get("object_ids").indexOf(id) !== -1) {
      cb(plot, plot.K3DInstance.getObjectById(id));
    }
  }
}
