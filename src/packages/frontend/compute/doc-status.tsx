/*
This is a component that should be placed at the top of a document to help
the user when they have requested their document run on a given compute
server.  It does the following:

- If id is as requested and is the project, do nothing.

- If id is as requested and is not the project, draw line in color of that compute server.

- If not where we want to be, defines how close:

  - 5%: compute server doesn't exist or is off and not owned by you
  - 10%: compute server is off
  - 25%: any status that isn't starting/running
  - 40%: compute server is starting
  - 55%: compute server is running
  - 65%: ...
  - 80%: compute server is running and detailed state has compute image running

- If compute server not running:
    - if exists and you own it, prompts user to start it and also shows the
      compute server's component so they can do so.
    - if not exists (or deleted), say so
    - if owned by somebody else, say so
*/

import Inline from "./inline";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { Alert, Progress, Spin } from "antd";
import type { ComputeServerUserInfo } from "@cocalc/util/db-schema/compute-servers";
import ComputeServer from "./compute-server";

export default function ComputeServerTransition({
  project_id,
  id,
  requestedId,
}) {
  const computeServers = useTypedRedux({ project_id }, "compute_servers");
  const account_id = useTypedRedux("account", "account_id");

  if (id == requestedId) {
    if (id == 0) {
      return null;
    }
    return <Inline colorOnly id={id} style={{ height: "5px" }} />;
  }

  if (requestedId == 0) {
    return (
      <Alert
        type="info"
        message={"Moving back to project..."}
        style={{ margin: "15px 5px" }}
      />
    );
  }

  if (computeServers == null) {
    return <Spin />;
  }

  const server: ComputeServerUserInfo | undefined = computeServers
    .get(`${requestedId}`)
    ?.toJS();
  const { progress, message, status } = getProgress(server, account_id);

  return (
    <div>
      <Progress
        percent={progress}
        style={{ width: "100%", padding: "0 15px", marginTop: "15px" }}
        status={status}
      />
      <Alert type="info" message={message} style={{ margin: "0 15px" }} />
      {server != null && (
        <div style={{ margin: "15px" }}>
          <ComputeServer
            editable={account_id == server.account_id}
            {...server}
          />
        </div>
      )}
    </div>
  );
}

function getProgress(
  server: ComputeServerUserInfo | undefined,
  account_id,
): {
  progress: number;
  message: string;
  status: "exception" | "active" | "normal" | "success";
} {
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

  if (server.account_id != account_id && server.state != "running") {
    return {
      progress: 0,
      message:
        "This is not your compute server, and it is not running. Only the owner of a compute server can start it.",
      status: "exception",
    };
  }

  if (server.state == "off") {
    return {
      progress: 10,
      message: "Please start your compute server.",
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
    if (isRecent(server.detailed_state?.compute?.expire)) {
      return {
        progress: 80,
        message: "Waiting for compute server to connect.",
        status: "normal",
      };
    }
  }

  if (server.detailed_state?.["filesystem-sync"]?.state == "ready") {
    if (isRecent(server.detailed_state?.["filesystem-sync"]?.expire)) {
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
