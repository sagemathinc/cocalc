/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */
import { React } from "../../app-framework";
import { webapp_client } from "../../webapp-client";
import { ProjectStatus as WSProjectStatus } from "../websocket/project-status";
import { ProjectStatus } from "../../../smc-project/project-status/types";
import { useProjectState } from "../page/project-state-hook";

// this records data from the synctable "project_status" in redux.
// used in page/page when a project is added to the UI
// if you want to know the project state, do
// const project_status = useTypedRedux({ project_id }, "status");
export function useProjectStatus(actions) {
  const project_id: string = actions.project_id;
  const statusRef = React.useRef<WSProjectStatus | null>(null);
  const project_state = useProjectState(project_id);

  function set_status(status) {
    actions.setState({ status });
  }

  function connect() {
    const status_sync = webapp_client.project_client.project_status(project_id);
    statusRef.current = status_sync;
    const update = () => {
      const data = status_sync.get();
      if (data != null) {
        set_status(data.toJS() as ProjectStatus);
      } else {
        console.warn(`status_sync ${project_id}: got no data`);
      }
    };
    status_sync.once("ready", update);
    status_sync.on("change", update);
  }

  // each time the project state changes to running (including when mounted) we connect/reconnect
  React.useEffect(() => {
    if (project_state.get("state") !== "running") return;
    try {
      connect();
      return () => {
        statusRef.current?.close();
      };
    } catch (err) {
      console.warn(`status_sync ${project_id} error: ${err}`);
    }
  }, [project_state]);
}
