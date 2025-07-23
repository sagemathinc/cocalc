/*
Dropdown on frame title bar for running that Jupyter notebook or terminal on a compute server.
*/

import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "antd";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { delay } from "awaiting";
import { avatar_fontcolor } from "@cocalc/frontend/account/avatar/font-color";
import SelectServer, { PROJECT_COLOR } from "./select-server";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { alert_message } from "@cocalc/frontend/alerts";
import { chatFile } from "@cocalc/frontend/frame-editors/generic/chat";
import InlineComputeServer from "@cocalc/frontend/compute/inline";

interface Props {
  project_id: string;
  path: string;
  frame_id?: string;
  style?: CSSProperties;
  actions?;
  size?;
  type: string;
  noLabel?;
}

export default function SelectComputeServerForFile({
  project_id,
  path,
  frame_id,
  actions,
  size,
  style,
  type,
  noLabel,
}: Props) {
  const getPath = (path) => {
    if (actions != null && type == "terminal") {
      if (frame_id == null) {
        throw Error("frame_id is required for terminal");
      }
      return actions.terminals.get(frame_id)?.termPath;
    }
    if (type == "chat") {
      return chatFile(path);
    }
    if (type == "jupyter_cell_notebook" && actions != null) {
      return actions.jupyter_actions.syncdb.path;
    }
    return path;
  };
  const [confirmSwitch, setConfirmSwitch] = useState<boolean>(false);
  const [idNum, setIdNum] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const lastValueRef = useRef<number | undefined>(0);

  const computeServers =
    useTypedRedux({ project_id }, "compute_servers")?.toJS() ?? [];
  const computeServerAssociations = useMemo(() => {
    return webapp_client.project_client.computeServers(project_id);
  }, [project_id]);
  const [value, setValue] = useState<number | undefined>(undefined);

  const okButtonRef = useRef<any>(undefined);
  useEffect(() => {
    if (confirmSwitch && okButtonRef.current) {
      // @ts-ignore
      setTimeout(() => okButtonRef.current.focus(), 1);
    }
  }, [confirmSwitch]);

  useEffect(() => {
    const handleChange = async () => {
      try {
        let p = getPath(path);
        if (p == null) {
          // have to wait for terminal state to be initialized, which
          // happens in next render loop:
          await delay(1);
          p = getPath(path);
          if (p == null) {
            // still nothing -- that's weird
            return;
          }
        }
        const id = (await computeServerAssociations.getServerIdForPath(p)) ?? 0;
        setValue(id == null ? undefined : id);
      } catch (err) {
        console.warn(err);
      }
    };
    computeServerAssociations.on("change", handleChange);
    (async () => {
      try {
        setLoading(true);
        await handleChange();
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      computeServerAssociations.removeListener("change", handleChange);
    };
  }, [project_id, path, type]);

  const params = confirmSwitch
    ? modalParams({
        current: lastValueRef.current ?? 0,
        target: idNum,
        path: getPath(path) ?? ".term", // only term null
      })
    : { description: "" };

  return (
    <>
      <SelectServer
        disabled={loading}
        size={size}
        project_id={project_id}
        style={style}
        value={value}
        setValue={(newValue) => {
          const idNum = newValue ?? 0;
          setIdNum(idNum);
          lastValueRef.current = value;
          if (value != idNum) {
            if (idNum) {
              computeServerAssociations.connectComputeServerToPath({
                id: idNum,
                path: getPath(path),
              });
              setValue(idNum);
            } else {
              computeServerAssociations.disconnectComputeServer({
                path: getPath(path),
              });
              setValue(undefined);
            }
          }
        }}
        noLabel={noLabel}
      />
      <Modal
        keyboard
        {...params}
        open={confirmSwitch}
        onCancel={() => {
          setConfirmSwitch(false);
          setIdNum(lastValueRef.current ?? 0);
          setValue(lastValueRef.current ?? 0);
        }}
        cancelButtonProps={{ style: { marginTop: "5px" } }}
        okButtonProps={{
          // @ts-ignore
          ref: okButtonRef,
          style: {
            marginTop: "5px",
            background: computeServers[idNum]?.color ?? PROJECT_COLOR,
            color: avatar_fontcolor(
              computeServers[idNum]?.color ?? PROJECT_COLOR,
            ),
          },
        }}
        onOk={() => {
          setConfirmSwitch(false);
          try {
            if (idNum) {
              computeServerAssociations.connectComputeServerToPath({
                id: idNum,
                path: getPath(path),
              });
              setValue(idNum);
            } else {
              computeServerAssociations.disconnectComputeServer({
                path: getPath(path),
              });
              setValue(undefined);
            }
          } catch (err) {
            alert_message({
              type: "error",
              message: `${err}`,
              timeout: 20,
            });
          }
        }}
      >
        {params.description}
      </Modal>
    </>
  );
}

export function modalParams({ current, target, path }) {
  let what;
  let consequence = "";
  if (path.endsWith(".term")) {
    what = "Run Terminal";
    consequence =
      "If there is a running terminal session it will be terminated.";
  } else if (path.endsWith(".ipynb")) {
    what = "Run Notebook";
    consequence = "If a kernel is currently running it will be stopped.";
  } else {
    what = "Open File";
  }
  const targetDesc = (
    <span key="target-desc">
      on <InlineComputeServer noColor key="target-name" id={target} titleOnly />
    </span>
  );
  const sourceDesc = (
    <span key="source-desc">
      on{" "}
      <InlineComputeServer noColor key="source-name" id={current} titleOnly />
    </span>
  );

  return {
    title: (
      <>
        {what} {targetDesc}
      </>
    ),
    cancelText: (
      <div style={{ display: "flex" }}>
        <div
          style={{
            maxWidth: "40ex",
            textOverflow: "ellipsis",
            overflow: "hidden",
            whiteSpace: "nowrap",
            marginRight: "5px",
          }}
        >
          Stay {sourceDesc}
        </div>
        <InlineComputeServer key="current-id" id={current} idOnly />
      </div>
    ),
    okText: (
      <div style={{ display: "flex" }}>
        <div
          style={{
            maxWidth: "40ex",
            textOverflow: "ellipsis",
            overflow: "hidden",
            whiteSpace: "nowrap",
            marginRight: "5px",
          }}
        >
          {what} {targetDesc}
        </div>
        <InlineComputeServer key="target-id" id={target} idOnly />
      </div>
    ),
    description: (
      <>
        Do you want to {what.toLowerCase()} '{path}' {targetDesc} instead of{" "}
        {sourceDesc}? {consequence}
      </>
    ),
  };
}
