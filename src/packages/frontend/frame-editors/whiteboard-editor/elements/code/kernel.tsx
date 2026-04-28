/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Modal, Popover } from "antd";
import { useEffect, useState } from "react";
import { CSS, useRedux } from "@cocalc/frontend/app-framework";
import useIsMountedRef from "@cocalc/frontend/app-framework/is-mounted-hook";
import { Icon } from "@cocalc/frontend/components/icon";
import { KernelSelector } from "@cocalc/frontend/jupyter/select-kernel";
import { Kernel } from "@cocalc/frontend/jupyter/status";
import { useFrameContext } from "../../hooks";
import { PANEL_STYLE } from "../../tools/panel";
import {
  JupyterActions,
  getJupyterFrameEditorActions,
  openJupyterNotebook,
} from "./actions";

const KERNEL_STYLE: CSS = {
  backgroundColor: "transparent",
  margin: "5px",
  padding: 0,
} as const;

export default function KernelPanel0() {
  const isMountedRef = useIsMountedRef();
  const {
    project_id,
    path,
    desc,
    id: frameId,
    actions: whiteboardActions,
  } = useFrameContext();
  const [actions, setActions] = useState<JupyterActions | null>(null);

  useEffect(() => {
    (async () => {
      const frameActions = await getJupyterFrameEditorActions({
        project_id,
        path,
      });
      if (!isMountedRef.current) return;
      setActions(frameActions.jupyter_actions);
    })();
  }, []);

  const state = actions?.store?.get("backend_state");
  if (
    actions != null &&
    (desc.get("selectedTool") == "code" ||
      (state != null && state != "ready" && state != "init") ||
      whiteboardActions.selectionContainsCellOfType(frameId, "code"))
  ) {
    return <KernelPanel actions={actions} />;
  }
  return null;
}

interface Props {
  actions: JupyterActions;
}

function KernelPanel({ actions }: Props) {
  const { project_id, path } = useFrameContext();
  const showKernelSelector: boolean | undefined = useRedux([
    actions.name,
    "show_kernel_selector",
  ]);
  const style: CSS = {
    ...PANEL_STYLE,
    maxWidth: "calc(100vw - 200px)",
    padding: "3px 5px 1px 5px",
    fontSize: "14px",
    right: 0,
  };
  return (
    <div style={style}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <div style={{ flex: 1 }}></div>
        <Kernel actions={actions} compact style={KERNEL_STYLE} />
        <Popover
          title={
            <>
              <Icon name="jupyter" /> Jupyter Notebook
            </>
          }
          content={
            <div style={{ maxWidth: "300px" }}>
              Code in this whiteboard is copied to a Jupyter notebook and
              executed; click here to open that notebook. Do <b>not</b> expect
              to be able to edit code in that notebook and have changes
              reflected in the whiteboard.
            </div>
          }
        >
          <Button
            style={{ color: "var(--cocalc-text-primary-strong, #434343)", position: "relative", top: "2px" }}
            size="small"
            onClick={() => {
              openJupyterNotebook({ project_id, path });
            }}
          >
            <Icon name="external-link" />
          </Button>
        </Popover>
      </div>
      <Modal
        open={!!showKernelSelector}
        onCancel={() => actions.hide_select_kernel()}
        footer={null}
        width={800}
        title={
          <>
            <Icon name="jupyter" /> Select Kernel
          </>
        }
      >
        <KernelSelector actions={actions} />
      </Modal>
    </div>
  );
}
