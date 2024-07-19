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
  directory?: string;
  trust?: boolean;
}

export function IpyWidget({ value, actions }: WidgetProps) {
  // console.log("IpyWidget", { value: value.toJS(), actions });
  const [unknown, setUnknown] = useState<boolean>(false);
  const divRef = useRef<any>(null);

  useEffect(() => {
    if (actions == null) {
      // console.log("IpyWidget: not rendering due to actions=null");
      return;
    }
    const div = divRef.current;
    if (div == null) {
      // console.log("IpyWidget: not rendering due to divRef.current=null");
      return;
    }
    loadFontAwesome();
    const id = value.get("model_id");

    const { widget_manager2: widget_manager } = actions;
    if (widget_manager == null) {
      // console.log("IpyWidget: not rendering due to widget_manager=null");
      return;
    }
    if (widget_manager.ipywidgets_state.get_model_state(id) == null) {
      // console.log("IpyWidget: not rendering due to uknown model state");
      setUnknown(true);
      return;
    }
    const manager = widget_manager?.manager;
    if (manager == null) {
      // console.log("IpyWidget: not rendering due to manager not being set");
      return;
    }
    render({ manager, id, div });
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
  return (
    <div>
      <div ref={divRef}></div>
    </div>
  );
}

async function render({ manager, id, div }) {
  try {
    await manager.render(id, div);

    // HACK: because upstream ipywidgets only checks for  MathJax.Hub to be defined then
    // crashes on load -- they don't see this bug because user has to explicitly re-evaluate
    // code to see anything on page refresh, due to all state being on the frontend.
    // @ts-ignore
    if (window.MathJax != null && window.MathJax.Hub == null) {
      // @ts-ignore
      MathJax.Hub.Queue = () => {};
    }
    setTimeout(() => {
      // @ts-ignore
      const elt = $(div) as any;
      // Run mathjax on labels:   widgets.HBox([widgets.Label(value="The $m$ in $E=mc^2$:"), widgets.FloatSlider()])
      elt.find(".widget-label").katex?.({ preProcess: true });
      elt.find(".widget-htmlmath").katex?.({ preProcess: true });
    }, 0);
  } catch (err) {
    console.error("Error Rendering Widget:", err);
  }
}
