/*
This is a component that should be placed at the top of a document to help
the user when they have requested their document run on a given compute
server.  It does the following:

- If id is as requested and is the project, do nothing.

- If id is as requested and is not the project, draw line in color of that compute server.

- If not where we want to be, defines how close via a percentage

- If compute server not running:
    - if exists and you own it, prompts user to start it and also shows the
      compute server's component so they can do so.
    - if not exists (or deleted), say so
    - if owned by somebody else, say so
*/

import Inline from "./inline";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { Alert, Button, Progress, Space, Spin, Tooltip } from "antd";
import type { ComputeServerUserInfo } from "@cocalc/util/db-schema/compute-servers";
import ComputeServer from "./compute-server";
import { useEffect, useState } from "react";
import { Icon } from "@cocalc/frontend/components";
import SyncButton from "./sync-button";
import { avatar_fontcolor } from "@cocalc/frontend/account/avatar/font-color";

export function ComputeServerDocStatus({ project_id, id, requestedId }) {
  const [showDetails, setShowDetails] = useState<boolean | null>(null);
  const computeServers = useTypedRedux({ project_id }, "compute_servers");
  const account_id = useTypedRedux("account", "account_id");

  useEffect(() => {
    // if the id or requestedId changes, need to reset to default behavior
    // regarding what is shown.
    setShowDetails(null);
  }, [id, requestedId]);

  const requestedServer = computeServers?.get(`${requestedId}`);
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
          requestedServer != null && !showDetails
            ? "1px solid #ccc"
            : undefined,
      }}
    >
      <Tooltip title={`${requestedServer.get("title")} (Id: ${requestedId})`}>
        <Button
          size="small"
          style={{
            marginTop: "-1px",
            marginRight: "1px",
            background: requestedServer.get("color"),
            color: avatar_fontcolor(requestedServer.get("color")),
            maxWidth: "20%",
          }}
          onClick={() => {
            setShowDetails(showDetails === true ? false : true);
          }}
        >
          <span
            style={{
              width: "100%",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {requestedServer.get("title")} (Id: {requestedId})
          </span>
        </Button>
      </Tooltip>
      <Tooltip
        mouseEnterDelay={0.9}
        title={
          <>
            {progress == 100 ? "Running on " : "Moving to "}{" "}
            <Inline id={requestedId} computeServer={requestedServer} />.
          </>
        }
      >
        <div
          onClick={() => {
            setShowDetails(showDetails === true ? false : true);
          }}
          style={{ display: "flex", flex: 1 }}
        >
          <div style={{ marginRight: "5px", flex: 1 }}>
            <Inline
              computeServer={requestedServer}
              colorOnly
              id={requestedId}
              style={{
                borderRadius: "5px",
                height: "22px",
                cursor: "pointer",
                width: `${progress}%`,
              }}
              colorLabel={progress < 100 ? `${progress}%` : ""}
            />
          </div>
        </div>
      </Tooltip>
      {progress == 100 && (
        <SyncButton
          disabled={excludeFromSync}
          style={{
            marginTop: "-1px",
            marginLeft: "-3px",
            float: "right",
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
          Sync Files
        </SyncButton>
      )}
    </div>
  );

  if (id == requestedId && !showDetails) {
    return topBar(100);
  }

  const server: ComputeServerUserInfo | undefined = computeServers
    ?.get(`${requestedId}`)
    ?.toJS();
  const { progress, message, status } = getProgress(
    server,
    account_id,
    id,
    requestedId,
  );
  if (showDetails != null && !showDetails) {
    return topBar(progress);
  }

  return (
    <div className="smc-vfill" style={{ flex: 100 }}>
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
            {...server}
          />
        )}
      </div>
    </div>
  );
}

function getProgress(
  server: ComputeServerUserInfo | undefined,
  account_id,
  id,
  requestedId,
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
  if (id == requestedId) {
    return {
      progress: 100,
      message: "Compute server is connected!",
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
    server.state != "starting"
  ) {
    return {
      progress: 0,
      message:
        "This is not your compute server, and it is not running. Only the owner of a compute server can start it.",
      status: "exception",
    };
  }

  // below here it isn't our server, it is running.

  if (server.state == "deprovisioned") {
    return {
      progress: 0,
      message:
        "Please start the compute server by clicking the Start button below.",
      status: "exception",
    };
  }

  if (server.state == "off") {
    return {
      progress: 10,
      message:
        "Please start the compute server by clicking the Start button below.",
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

  // below it is running
  if (server.detailed_state?.compute?.state == "ready") {
    if (isRecent(server.detailed_state?.compute?.time)) {
      return {
        progress: 80,
        message: "Waiting for compute server to connect.",
        status: "normal",
      };
    }
  }

  if (server.detailed_state?.["filesystem-sync"]?.state == "ready") {
    if (isRecent(server.detailed_state?.["filesystem-sync"]?.time)) {
      return {
        progress: 65,
        message: "Waiting for compute server to fully boot up.",
        status: "active",
      };
    }
  }

  return {
    progress: 50,
    message: "Waiting for compute server to finish booting up.",
    status: "active",
  };
}

function isRecent(expire = 0) {
  return Date.now() - expire < 60 * 1000;
}
