import { useEffect, useRef, useState } from "react";
import { CellOutput } from "@cocalc/frontend/jupyter/cell-output";
import { fromJS } from "immutable";
import { useFrameContext } from "../../hooks";
import { path_split } from "@cocalc/util/misc";
import { getJupyterActions } from "./actions";
import { useIsMountedRef } from "@cocalc/frontend/app-framework";
import type { JupyterActions } from "@cocalc/frontend/jupyter/browser-actions";
import useWheel from "../scroll-wheel";

// Support for all the output Jupyter MIME types must be explicitly loaded.
import "@cocalc/frontend/jupyter/output-messages/mime-types/init-frontend";

export default function Output({ element, onClick }) {
  const { project_id, path } = useFrameContext();
  const isMounted = useIsMountedRef();
  const [jupyterActions, setJupyterActions] = useState<
    JupyterActions | undefined
  >(undefined);

  // Initialize state needed for widgets to work.
  useEffect(() => {
    (async () => {
      const jupyter_actions = await getJupyterActions({ project_id, path });
      if (!isMounted.current) return;
      setJupyterActions(jupyter_actions);
    })();
  }, []);

  const divRef = useRef(null);
  useWheel(divRef);

  if (jupyterActions == null) {
    // don't render CellOutput until loaded, since CellOutput doesn't
    // update when just the name changes from undefined to a string --
    // it just assumes name is known.
    return null;
  }

  return (
    <div
      className="nodrag" /* because of ipywidgets, e.g., sliders */
      onClick={onClick}
    >
      <CellOutput
        actions={jupyterActions}
        name={jupyterActions?.name}
        id={element.id}
        cell={fromJS(element.data)}
        project_id={project_id}
        directory={path_split(path).head}
        trust={true}
        complete={false}
        hidePrompt
        divRef={divRef}
        style={{
          maxHeight: "80vh",
          overflow: "auto",
          display: "block" /* must specify or scroll blocking doesn't work */,
        }}
      />
    </div>
  );
}
