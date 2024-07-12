/*
ipywidgets rendering using @cocalc/widgets
*/

import { useEffect, useRef } from "react";
import type { JupyterActions } from "../browser-actions";
import { Map } from "immutable";
require("@jupyter-widgets/controls/css/widgets.css");

interface WidgetProps {
  value: Map<string, any>;
  actions?: JupyterActions;
  name: string;
  project_id?: string;
  directory?: string;
  trust?: boolean;
}

export function IpyWidget({ value, name, actions }: WidgetProps) {
  const divRef = useRef<any>(null);
  useEffect(() => {
    if (actions == null || divRef.current == null) return;
    const id = value.get("model_id");
    const manager = actions.widget_manager?.v2();
    if (manager == null) return;
    try {
      manager.render(id, divRef.current);
    } catch (err) {
      console.warn(err);
    }
  }, []);
  console.log("IpyWidget", { name });
  return (
    <div
      id="fubar-widget"
      ref={divRef}
      style={{ borderLeft: "0.1px solid red" }}
    ></div>
  );
}
