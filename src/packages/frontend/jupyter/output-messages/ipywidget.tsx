/*
ipywidgets rendering using @cocalc/widgets
*/

import { useEffect, useRef, useState } from "react";
import { Icon } from "@cocalc/frontend/components/icon";
import { Alert, Button } from "antd";
import type { JupyterActions } from "../browser-actions";
import { Map } from "immutable";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";

// TODO: it would be better if somehow this were in @cocalc/jupyter, to 100% ensure css stays aligned.
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
  id?: string;
}

export function IpyWidget({ id: cell_id, value, actions }: WidgetProps) {
  // console.log("IpyWidget", { value: value.toJS(), actions });
  const [unknown, setUnknown] = useState<boolean>(false);
  const divRef = useRef<any>(null);
  // We *ONLY* render widgets when they are visible.  Why?
  //  (1) some widgets -- k3d labels!! -- assume they are visible, and just totally crash if not, due to bad code
  //  (2) efficiency.
  const { isVisible } = useFrameContext();

  useEffect(() => {
    if (actions == null || !isVisible) {
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

    const { widget_manager } = actions;
    if (widget_manager == null) {
      // console.log("IpyWidget: not rendering due to widget_manager=null");
      return;
    }
    if (widget_manager.ipywidgets_state.getSerializedModelState(id) == null) {
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

    return () => {
      $(div).empty();
    };
  }, [isVisible]);

  if (unknown) {
    const msg = "Run cell to load widget.";
    return (
      <Alert
        showIcon
        style={{ margin: "15px" }}
        type="warning"
        message={
          actions != null && cell_id ? (
            <Button
              type="link"
              onClick={() => {
                actions.run_cell(cell_id);
              }}
            >
              <Icon name="step-forward" /> {msg}
            </Button>
          ) : (
            <span>{msg}</span>
          )
        }
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
