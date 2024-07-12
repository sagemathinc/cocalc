/*
ipywidgets rendering using @cocalc/widgets
*/

import { useEffect, useRef, useState } from "react";
import { Alert } from "antd";
import type { JupyterActions } from "../browser-actions";
import { Map } from "immutable";
require("@jupyter-widgets/controls/css/widgets.css");

let loadFontAwesomeDone = false;
function loadFontAwesome() {
  if (loadFontAwesomeDone) return;
  loadFontAwesomeDone = true;
  // Some widgets (e.g., ipympl) rely on icons from font-awesome, so include that in the page
  const fontAwesome = document.createElement("link");
  fontAwesome.rel = "stylesheet";
  // old cdn but it works... (TODO)
  fontAwesome.href =
    "https://cdn.jsdelivr.net/npm/font-awesome@4.7.0/css/font-awesome.min.css";
  document.head.appendChild(fontAwesome);
}

interface WidgetProps {
  value: Map<string, any>;
  actions?: JupyterActions;
  name: string;
  project_id?: string;
  directory?: string;
  trust?: boolean;
}

export function IpyWidget({ value, actions }: WidgetProps) {
  const [unknown, setUnknown] = useState<boolean>(false);
  const divRef = useRef<any>(null);

  useEffect(() => {
    if (actions == null || divRef.current == null) return;
    loadFontAwesome();
    const id = value.get("model_id");

    const { widget_manager } = actions;
    if (widget_manager == null) {
      return;
    }
    if (widget_manager.ipywidgets_state.get_model_state(id) == null) {
      setUnknown(true);
      return;
    }
    const manager = widget_manager?.v2();
    if (manager == null) return;
    try {
      manager.render(id, divRef.current);
    } catch (err) {
      console.warn(err);
    }
  }, []);

  if (unknown) {
    return (
      <Alert
        showIcon
        style={{ margin: "15px" }}
        type="warning"
        message="Run this cell to load this widget."
      />
    );
  }
  return <div ref={divRef}></div>;
}
