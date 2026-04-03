/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Switch, Tooltip } from "antd";
import { delay } from "awaiting";

import { CSS } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components/icon";
import { useFrameContext } from "../../hooks";
import { Element } from "../../types";
import { getJupyterActions } from "./actions";

const TOGGLE_LABEL: CSS = {
  cursor: "pointer",
  userSelect: "none",
} as const;

interface Props {
  element: Element;
  focused?: boolean;
  canvasScale?: number;
}

export default function CodeControlBar({ element, canvasScale = 1 }: Props) {
  const { actions, project_id, path, id } = useFrameContext();
  return (
    <div
      style={{
        padding: "2px 6px",
        border: "1px solid var(--cocalc-border, #ccc)",
        borderRadius: "3px",
        background: "var(--cocalc-bg-base, white)",
        boxShadow: "1px 3px 5px rgb(33 33 33 / 50%)",
        position: "absolute",
        bottom: `calc(100% + ${10 / canvasScale}px)`,
        left: 0,
        zIndex: 10,
        whiteSpace: "nowrap",
        display: "flex",
        alignItems: "center",
        gap: "5px",
        fontSize: "14px",
        transform: `scale(${1 / canvasScale})`,
        transformOrigin: "bottom left",
      }}
    >
      {!element.data?.hideInput && element.data?.runState == "busy" && (
        <Tooltip title="Interrupt running computation">
          <Button
            size="middle"
            onClick={async () => {
              const jupyter_actions = await getJupyterActions({
                project_id,
                path,
              });
              jupyter_actions.signal("SIGINT");
              await delay(500);
              if (jupyter_actions.store.get("kernel_state") != "running") {
                actions.setElementData({
                  element,
                  obj: { runState: "done" },
                });
              }
            }}
          >
            <Icon name="stop" /> Stop
          </Button>
        </Tooltip>
      )}
      <Tooltip title="Evaluate code (Shift+Enter)">
        <Button
          disabled={element.data?.runState == "busy"}
          size="middle"
          onClick={() => {
            void actions.runCodeElement({ id: element.id });
          }}
        >
          <Icon name="play" /> Run
        </Button>
      </Tooltip>
      <Tooltip title="Run the directed code-cell tree rooted at this cell">
        <Button
          disabled={element.data?.runState == "busy"}
          size="middle"
          onClick={() => {
            void actions.runCodeTree(id, element.id);
          }}
        >
          <Icon name="play" /> Run Tree
        </Button>
      </Tooltip>
      {!element.locked && (
        <Tooltip title="Toggle display of input">
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 3, marginLeft: 4 }}
          >
            <Switch
              size="small"
              checked={!element.data?.hideInput}
              onChange={(checked) => {
                actions.setElementData({
                  element,
                  obj: { hideInput: !checked },
                });
              }}
            />
            <span
              style={TOGGLE_LABEL}
              onClick={() => {
                actions.setElementData({
                  element,
                  obj: { hideInput: !element.data?.hideInput },
                });
              }}
            >
              Input
            </span>
          </span>
        </Tooltip>
      )}
      {!element.locked && (
        <Tooltip title="Toggle display of output">
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 3, marginLeft: 2 }}
          >
            <Switch
              size="small"
              disabled={
                element.data?.output == null ||
                Object.keys(element.data?.output).length == 0
              }
              checked={!element.data?.hideOutput}
              onChange={(checked) => {
                actions.setElementData({
                  element,
                  obj: { hideOutput: !checked },
                });
              }}
            />
            <span
              style={TOGGLE_LABEL}
              onClick={() => {
                if (
                  element.data?.output == null ||
                  Object.keys(element.data?.output).length == 0
                )
                  return;
                actions.setElementData({
                  element,
                  obj: { hideOutput: !element.data?.hideOutput },
                });
              }}
            >
              Output
            </span>
          </span>
        </Tooltip>
      )}
    </div>
  );
}
