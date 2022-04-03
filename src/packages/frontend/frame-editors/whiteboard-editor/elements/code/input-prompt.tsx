import { useState } from "react";
import { InputPrompt } from "@cocalc/frontend/jupyter/prompt/input";
import { getJupyterActions } from "./actions";
import { JupyterActions } from "@cocalc/frontend/jupyter/browser-actions";
import { useFrameContext } from "../../hooks";
import { useAsyncEffect } from "use-async-effect";

export default function CodeInputPrompt({ element }) {
  const { project_id, path } = useFrameContext();
  const [actions, setActions] = useState<JupyterActions | undefined>(undefined);
  useAsyncEffect(async () => {
    setActions(await getJupyterActions({ project_id, path }));
  });
  return (
    <InputPrompt
      style={{ textAlign: undefined }}
      type="code"
      exec_count={element.data?.execCount}
      state={element.data?.runState}
      kernel={element.data?.kernel}
      start={element.data?.start}
      end={element.data?.end}
      actions={actions}
      id={element.id}
      hideMove
      hideCut
      hideRun
    />
  );
}
