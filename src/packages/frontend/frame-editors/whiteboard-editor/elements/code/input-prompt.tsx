/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { useState } from "react";
import { useAsyncEffect } from "use-async-effect";

import useIsMountedRef from "@cocalc/frontend/app-framework/is-mounted-hook";
import { JupyterActions } from "@cocalc/frontend/jupyter/browser-actions";
import { InputPrompt } from "@cocalc/frontend/jupyter/prompt/input";
import { useFrameContext } from "../../hooks";
import { getJupyterActions } from "./actions";

export default function CodeInputPrompt({ element }) {
  const { project_id, path } = useFrameContext();
  const [actions, setActions] = useState<JupyterActions | undefined>(undefined);
  const isMountedRef = useIsMountedRef();

  useAsyncEffect(async () => {
    const actions = await getJupyterActions({ project_id, path });
    if (!isMountedRef.current) return;
    setActions(actions);
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
    />
  );
}
