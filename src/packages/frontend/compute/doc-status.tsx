/*
This is a component that should be placed at the top of a document to help
the user when they have requested their document run on a given compute
server.  It does the following:

- If id is as requested and is the project, do nothing.

- If id is as requested and is not the project, draw line in color of that compute server.

*/

import Inline from "./inline";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { Alert, Button, Progress, Space, Spin, Tooltip } from "antd";
import type { ComputeServerUserInfo } from "@cocalc/util/db-schema/compute-servers";
import ComputeServer from "./compute-server";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@cocalc/frontend/components";
import SyncButton from "./sync-button";
import { avatar_fontcolor } from "@cocalc/frontend/account/avatar/font-color";
import { DisplayImage } from "./select-image";
import Menu from "./menu";
import { SpendLimitStatus } from "./spend-limit";
import useComputeServerApiState from "./use-compute-server-api-state";

interface Props {
  project_id: string;
  id: number;
  requestedId?: number;
  noSync?: boolean;
  standalone?: boolean;
}

export function ComputeServerDocStatus({
  project_id,
  id,
  requestedId,
  noSync,
  standalone,
}: Props) {
  if (requestedId == null) {
    requestedId = id;
  }
  const apiState = useComputeServerApiState({
    project_id,
    compute_server_id: requestedId,
  });

  const [showDetails, setShowDetails] = useState<boolean | null>(null);
  const computeServers = useTypedRedux({ project_id }, "compute_servers");
  const account_id = useTypedRedux("account", "account_id");

  useEffect(() => {
    // if the id or requestedId changes, need to reset to default behavior
    // regarding what is shown.
    setShowDetails(null);
  }, [id, requestedId]);

  const requestedServer = computeServers?.get(`${requestedId}`);
  const server: ComputeServerUserInfo | undefined = useMemo(
    () => requestedServer?.toJS(),
    [requestedServer],
  );
  const syncExclude = requestedServer?.getIn([
    "configuration",
    "excludeFromSync",
  ]);
  const excludeFromSync =
    syncExclude?.includes("~") || syncExclude?.includes(".");
  const syncState = requestedServer?.getIn([
    "detailed_state",
    "filesystem-sync",
  ]);

  // show sync errors
  useEffect(() => {
    if (syncState?.get("extra")) {
      setShowDetails(true);
    }
  }, [syncState?.get("extra")]);

  if (id == 0 && requestedId == 0) {
    return null;
  }

  if (computeServers == null) {
    return null;
  }

  const topBar = (progress) => (
    <div
      style={{
        display: "flex",
        borderBottom:
          !standalone && requestedServer != null && !showDetails
            ? "1px solid #ccc"
            : undefined,
        ...(standalone
          ? { border: "1px solid #ddd", borderRadius: "5px" }
          : undefined),
      }}
    >
      {progress == 100 && !noSync && (
        <SyncButton
          type="text"
          disabled={excludeFromSync}
          style={{
            marginLeft: "-3px",
            float: "right",
            width: "90px",
          }}
          size="small"
          compute_server_id={id}
          project_id={project_id}
          time={syncState?.get("time")}
          syncing={
            requestedServer?.get("state") == "running" &&
            !syncState?.get("extra") &&
            (syncState?.get("progress") ?? 100) <
              80 /* 80 because the last per for read cache is not sync and sometimes gets stuck */
          }
        >
          Sync
        </SyncButton>
      )}
      {progress < 100 && (
        <Tooltip title={"Make sure the compute server is running."}>
          <div
            onClick={() => {
              setShowDetails(showDetails === true ? false : true);
            }}
            style={{
              whiteSpace: "nowrap",
              padding: "2.5px 5px",
              background: "darkred",
              color: "white",
              height: "24px",
            }}
          >
            NOT CONNECTED
          </div>
        </Tooltip>
      )}
      <Tooltip
        mouseEnterDelay={0.9}
        title={
          <>
            {progress == 100 ? "Running on " : "Opening on "}{" "}
            <Inline id={requestedId} computeServer={requestedServer} />.
          </>
        }
      >
        <div
          onClick={() => {
            setShowDetails(showDetails === true ? false : true);
          }}
          style={{
            height: "24px",
            cursor: "pointer",
            padding: "2px 5px",
            background: requestedServer?.get("color") ?? "#fff",
            color: avatar_fontcolor(requestedServer?.get("color") ?? "#fff"),
            width: "100%",
            overflow: "hidden",
            textAlign: "center",
          }}
        >
          {progress < 100 ? `${progress}% - ` : ""}
          <div style={{ display: "inline-block" }}>
            <div style={{ display: "flex" }}>
              <div
                style={{
                  maxWidth: "30ex",
                  textOverflow: "ellipsis",
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                  marginRight: "5px",
                }}
              >
                {requestedServer?.get("title") ?? "Loading..."}
              </div>
              (Id: {requestedServer?.get("project_specific_id")})
            </div>
          </div>
          <DisplayImage
            style={{
              marginLeft: "10px",
              borderLeft: "1px solid black",
              paddingLeft: "10px",
            }}
            configuration={requestedServer?.get("configuration")?.toJS()}
          />
        </div>
      </Tooltip>
      {requestedServer != null && (
        <SpendLimitStatus server={server} horizontal />
      )}
      <Menu
        fontSize={"13pt"}
        size="small"
        style={{ marginTop: "1px", height: "10px" }}
        id={requestedId}
        project_id={project_id}
      />
    </div>
  );

  const { progress, message, status } = getProgress(
    server,
    account_id,
    requestedId,
    apiState,
  );
  if (!showDetails) {
    if (
      showDetails == null &&
      progress < 100 &&
      (apiState != null || status == "exception")
    ) {
      setShowDetails(true);
    }
    return topBar(progress);
  }

  return (
    <div
      className="smc-vfill"
      style={{ flex: 3, minHeight: "300px", background: "white" }}
    >
      <div>{topBar(progress)}</div>
      <div
        className="smc-vfill"
        style={{
          border: `1px solid #ccc`,
          borderRadius: "5px",
          margin: "15px",
          padding: "5px",
          boxShadow: "rgba(33, 33, 33, 0.5) 1px 5px 7px",
          marginTop: "0px",
          overflow: "auto",
        }}
      >
        <div
          style={{
            textAlign: "center",
          }}
        >
          <Space style={{ width: "100%", margin: "15px 0" }}>
            <Button
              size="large"
              type="text"
              onClick={() => setShowDetails(false)}
            >
              <Icon name="times" /> Hide
            </Button>
            <Progress
              type="circle"
              trailColor="#e6f4ff"
              percent={progress}
              strokeWidth={14}
              size={42}
            />
            <Alert
              style={{ margin: "0 15px" }}
              type="info"
              message={
                <>
                  {message}{" "}
                  {progress < 100 && status != "exception" ? (
                    <Spin style={{ marginLeft: "15px" }} />
                  ) : undefined}
                </>
              }
            />
          </Space>
        </div>
        {server != null && (
          <ComputeServer
            editable={account_id == server.account_id}
            server={server}
          />
        )}
      </div>
    </div>
  );
}

// gets progress of starting the compute server with given id and
// having it actively available to host this file.

function getProgress(
  server: ComputeServerUserInfo | undefined,
  account_id,
  requestedId,
  apiState,
): {
  progress: number;
  message: string;
  status: "exception" | "active" | "normal" | "success";
} {
  if (requestedId == 0) {
    return {
      progress: 50,
      message: "Moving back to project...",
      status: "active",
    };
  }

  if (apiState == "running") {
    return {
      progress: 100,
      message: "Compute server is fully connected!",
      status: "success",
    };
  }

  if (server == null) {
    return {
      progress: 0,
      message: "Server does not exist.  Please select a different server.",
      status: "exception",
    };
  }
  if (server.deleted) {
    return {
      progress: 0,
      message:
        "Server was deleted.  Please select a different server or undelete it.",
      status: "exception",
    };
  }

  if (
    server.account_id != account_id &&
    server.state != "running" &&
    server.state != "starting" &&
    !server.configuration?.allowCollaboratorControl
  ) {
    return {
      progress: 0,
      message:
        "This is not your compute server, and it is not running. Only the owner of this compute server can start it.",
      status: "exception",
    };
  }

  if (apiState != null) {
    if (apiState == "starting") {
      return {
        progress: 75,
        message: "Compute server is starting.",
        status: "active",
      };
    }
  }

  if (server.state == "deprovisioned") {
    return {
      progress: 0,
      message: "Please start the compute server.",
      status: "exception",
    };
  }

  if (server.state == "off") {
    return {
      progress: 10,
      message: "Please start the compute server.",
      status: "exception",
    };
  }
  if (server.state == "suspended") {
    return {
      progress: 15,
      message: "Please resume the compute server.",
      status: "exception",
    };
  }

  if (server.state != "starting" && server.state != "running") {
    return {
      progress: 25,
      message: "Please start the compute server.",
      status: "exception",
    };
  }

  if (server.state == "starting") {
    return {
      progress: 40,
      message: "Compute server is starting.",
      status: "active",
    };
  }

  return {
    progress: 50,
    message: "Compute server is starting...",
    status: "active",
  };
}

// This is useful elsewhere to give a sense of how the compute server
// is doing as it progresses from running to really being fully available.
function getRunningStatus(server, apiState) {
  if (server == null) {
    return { progress: 0, message: "Loading...", status: "exception" };
  }
  return getProgress(server, webapp_client.account_id, server.id, apiState);
}

export function RunningProgress({
  server,
  style,
}: {
  server: ComputeServerUserInfo | undefined;
  style?;
}) {
  const apiState = useComputeServerApiState({
    project_id: server?.project_id,
    compute_server_id: server?.id,
  });
  const { progress, message } = useMemo(() => {
    return getRunningStatus(server, apiState);
  }, [server]);

  return (
    <Tooltip title={message}>
      <Progress
        trailColor="#e6f4ff"
        percent={progress}
        strokeWidth={14}
        style={style}
      />
    </Tooltip>
  );
}
