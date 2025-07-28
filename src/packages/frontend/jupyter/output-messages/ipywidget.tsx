/*
ipywidgets rendering using @cocalc/widgets
*/

import { useEffect, useRef, useState } from "react";
import { Icon } from "@cocalc/frontend/components/icon";
import { Alert, Button } from "antd";
import type { JupyterActions } from "../browser-actions";
import { Map } from "immutable";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { once } from "@cocalc/util/async-utils";
import { delay } from "awaiting";

const MAX_WAIT = 5000;

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
  //  (1) some widgets -- k3d labels!! -- assume they are visible, and just totally crash if
  //      not, due to bad code  [no idea if this is true anymore, given that we switched to upstream k3d.]
  //  (2) efficiency.
  const { isVisible } = useFrameContext();
  const [isReady, setIsReady] = useState<boolean>(false);
  const valueRef = useRef<any>(value);

  // We have to wait a bit for ipywidgets_state.getSerializedModelState(id)
  // to be defined, since state of the notebook and state of widgets are
  // done in parallel, hence unpredicatable order, over the network
  // (since using NATS instead of a single socket).
  useEffect(() => {
    (async () => {
      const ipywidgets_state = actions?.widget_manager?.ipywidgets_state;
      if (ipywidgets_state == null) {
        setIsReady(true);
        return;
      }
      const start = Date.now();
      const id = value.get("model_id");
      while (Date.now() - start <= MAX_WAIT) {
        if (!valueRef.current.equals(value)) {
          // let new function take over
          return;
        }
        if (ipywidgets_state.getSerializedModelState(id) != null) {
          /*
          Without the delay, this fails the first time usually.  I think
          the delay just allows ipywidegts_state to process the batch of
          messages that have arrived defining the state, rather than just
          the first message:

%matplotlib ipympl
import matplotlib.pyplot as plt
import numpy as np
fig, ax = plt.subplots()
x = np.linspace(0, 2*np.pi, 100)
y = np.sin(3*x)
ax.plot(x, y)
          */
          await delay(1);
          setIsReady(true);
          return;
        } else {
          setIsReady(false);
        }
        try {
          await once(ipywidgets_state, "change", MAX_WAIT);
        } catch {
          setIsReady(true);
          return;
        }
      }
      setIsReady(true);
    })();
  }, [value]);

  useEffect(() => {
    if (actions == null || !isVisible || !isReady) {
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
  }, [isVisible, isReady]);

  if (unknown) {
    const msg = "Run cell to load widget";
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
                actions.runCells([cell_id]);
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

function katex(div) {
  const elt = $(div) as any;
  elt.find(".widget-label").katex?.({ preProcess: true });
  elt.find(".widget-htmlmath").katex?.({ preProcess: true });
}

// Initialize a MutationObserver to observe changes to the content of the div
function observeDiv(div) {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      // Check if the mutation affects the child list or subtree (for deeper changes)
      // @ts-ignore
      if (mutation.type === "childList" || mutation.type === "subtree") {
        // Run KaTeX processing here
        katex(div);
      }
    });
  });

  // Define what to watch - child nodes and subtree changes
  const config = { childList: true, subtree: true };

  // Start observing
  observer.observe(div, config);

  // Return observer if you need to disconnect later
  return observer;
}

// Inside the render function, after the widget is rendered, observe the div
async function render({ manager, id, div }) {
  try {
    await manager.render(id, div);

    // Observe div for changes -- see https://github.com/sagemathinc/cocalc/issues/8042
    observeDiv(div);

    // HACK: because upstream ipywidgets only checks for  MathJax.Hub to be defined then
    // crashes on load -- they don't see this bug because user has to explicitly re-evaluate
    // code to see anything on page refresh, due to all state being on the frontend.
    // CoCalc doesn't use Mathjax anymore, so this should just be a no-op for us.  However,
    // we leave it in some some random widget might set it...
    // @ts-ignore
    if (window.MathJax != null && window.MathJax.Hub == null) {
      // @ts-ignore
      MathJax.Hub.Queue = () => {};
    }

    setTimeout(() => katex(div), 0);
  } catch (err) {
    console.error("Error Rendering Widget:", err);
  }
}
