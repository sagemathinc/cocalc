/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
The main purpose of this component is to provide a big start button that users
use to start this project. When the project is fully up and running this
component is invisible.

It's really more than just that button, since it gives info as starting/stopping
happens, and also when the system is heavily loaded.
*/

import { Alert, Button } from "antd";
import { redux, React, useMemo, useTypedRedux } from "../app-framework";
import { A, Icon, ProjectState, Space, VisibleMDLG } from "../r_misc";
import { DOC_TRIAL } from "./trial-banner";
import { allow_project_to_run } from "./client-side-throttle";
import { server_minutes_ago } from "smc-util/misc";

interface Props {
  project_id: string;
}

export const StartButton: React.FC<Props> = ({ project_id }) => {
  const project_map = useTypedRedux("projects", "project_map");
  const state = useMemo(() => {
    return project_map?.getIn([project_id, "state"]);
  }, [project_map]);

  // start_requested is true precisely if a start of this project
  // is currently requested,,and obviously didn't get done.
  // Making the UI depend on this instead of *just* the state
  // makes things feel more responsive.
  const starting = useMemo(() => {
    if (state?.get("state") == "starting" || state?.get("state") == "opening")
      return true;
    const x = project_map?.getIn([project_id, "action_request"]);
    if (
      state?.get("state") == "running" ||
      x == null /* no action request at all */ ||
      x.get("action") != "start" /* a non-start action */ ||
      x.get("finished") >= new Date(x.get("time")) /* already done */ ||
      new Date(x.get("time")) <= server_minutes_ago(10) /* old -- ignore */
    ) {
      // already happened
      return false;
    }
    // action is start and it didn't get taken care of yet:
    return true;
  }, [project_map]);

  if (state?.get("state") == "running") {
    return <></>;
  }

  function render_not_allowed() {
    return (
      <VisibleMDLG>
        <Alert
          style={{ margin: "10px 20%" }}
          message={
            <span style={{ fontWeight: 500, fontSize: "14pt" }}>
              Too many trial projects!
            </span>
          }
          type="error"
          description={
            <span style={{ fontSize: "12pt" }}>
              Unfortunately, there are too many{" "}
              <A href={DOC_TRIAL}>trial projects</A> running on CoCalc right now
              and paying customers have priority. Try running your trial project
              later or{" "}
              <a
                onClick={() => {
                  redux.getActions("page").set_active_tab("account");
                  redux.getActions("account").set_active_tab("licenses");
                }}
              >
                <u>upgrade using a license</u>.
              </a>
            </span>
          }
        />
      </VisibleMDLG>
    );
  }

  function render_start_project_button() {
    const enabled =
      allow_project_to_run(project_id) &&
      ["opened", "closed", "archived"].includes(state?.get("state"));
    return (
      <div>
        <Button
          type="primary"
          size="large"
          disabled={!enabled || starting}
          onClick={() => {
            redux.getActions("projects").start_project(project_id);
          }}
        >
          {starting ? (
            <Icon name="cc-icon-cocalc-ring" spin />
          ) : (
            <Icon name="play" />
          )}
          <Space /> <Space /> Start{starting ? "ing" : ""} project
        </Button>
      </div>
    );
  }

  const allowed = allow_project_to_run(project_id);

  // In case user is admin viewing another user's project, we provide a
  // special mode.
  function render_admin_view() {
    return (
      <Alert
        type="error"
        message="Admin Project View"
        description={
          <>
            WARNING: You are viewing this project as an admin! (1) Some things
            won't work. (2) Be <b>VERY careful</b> opening any files, since this
            is a dangerous attack vector.
          </>
        }
      />
    );
  }

  function render_normal_view() {
    return (
      <Alert
        message={
          <>
            <span style={{ fontSize: "20pt", color: "#666" }}>
              <ProjectState state={state} show_desc={allowed} />
            </span>
            {render_start_project_button()}
            {!allowed && render_not_allowed()}
          </>
        }
        type="warning"
      />
    );
  }

  return (
    <div
      style={{
        fontSize: "40px",
        textAlign: "center",
        color: "#666666",
        marginBottom: "15px",
        borderBottom: "1px solid grey",
        borderTop: "1px solid grey",
        paddingBottom: "10px",
      }}
    >
      {state == null && redux.getStore("account")?.get("is_admin")
        ? render_admin_view()
        : render_normal_view()}
    </div>
  );
};
