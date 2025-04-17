/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
The main purpose of this component is to provide a big start button that users
use to start this project. When the project is fully up and running this
component is invisible.

It's really more than just that button, since it gives info as starting/stopping
happens, and also when the system is heavily loaded.
*/

import { Alert, Button, Space } from "antd";
import { CSSProperties, useRef } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { redux, useMemo, useTypedRedux } from "@cocalc/frontend/app-framework";
import {
  A,
  Icon,
  ProjectState,
  VisibleMDLG,
} from "@cocalc/frontend/components";
import { server_seconds_ago } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { useAllowedFreeProjectToRun } from "./client-side-throttle";
import { useProjectContext } from "./context";
import { DOC_TRIAL } from "./project-banner";

const STYLE: CSSProperties = {
  fontSize: "40px",
  textAlign: "center",
  color: COLORS.GRAY_M,
} as const;

export function StartButton() {
  const intl = useIntl();
  const { project_id } = useProjectContext();
  const project_map = useTypedRedux("projects", "project_map");
  const lastNotRunningRef = useRef<null | number>(null);
  const allowed = useAllowedFreeProjectToRun(project_id);

  const state = useMemo(() => {
    const state = project_map?.get(project_id)?.get("state");
    if (state != null) {
      lastNotRunningRef.current =
        state.get("state") === "running" ? null : Date.now();
    }
    return state;
  }, [project_map]);

  // start_requested is true precisely if a start of this project
  // is currently requested, and obviously didn't get done.
  // Making the UI depend on this instead of *just* the state
  // makes things feel more responsive.
  const starting = useMemo(() => {
    if (state?.get("state") === "starting" || state?.get("state") === "opening")
      return true;
    if (state?.get("state") === "running") return false;
    const action_request = (
      project_map?.getIn([project_id, "action_request"]) as any
    )?.toJS() as any;
    if (action_request == null) {
      return false; // no action request at all
    }
    if (action_request.action !== "start") {
      return false; // a non-start action
    }
    if (action_request.finished >= new Date(action_request.time)) {
      return false; // already done
    }
    if (new Date(action_request.time) <= server_seconds_ago(20)) {
      // Something is wrong, and the request got ignored for at least 20s,
      // so allow user to try again.
      return false;
    }

    // action is start and it didn't quite get taken care of yet by backend server,
    // but keep disabled so the user doesn't keep making the request.
    return true;
  }, [project_map]);

  if (state?.get("state") === "running") {
    return null;
  }

  function render_not_allowed() {
    // only show this warning if we got a clear answer that it is not allowed to run
    if (allowed === false)
      return (
        <VisibleMDLG>
          <Alert
            style={{ margin: "10px 20%" }}
            message={
              <span style={{ fontWeight: 500, fontSize: "14pt" }}>
                <FormattedMessage
                  id="project.start-button.trial.message"
                  defaultMessage={"Too Many Free Trial Projects"}
                />
              </span>
            }
            type="error"
            description={
              <span style={{ fontSize: "12pt" }}>
                <FormattedMessage
                  id="project.start-button.trial.description"
                  defaultMessage={`There is no more capacity for <A>Free Trial projects</A>on CoCalc right now.
                  {br}
                  <A2>Upgrade your project</A2> using <A3>a license</A3> or {A4}.
                  `}
                  values={{
                    br: <br />,
                    A: (c) => <A href={DOC_TRIAL}>{c}</A>,
                    A2: (c) => (
                      <a
                        onClick={() => {
                          redux
                            .getProjectActions(project_id)
                            .set_active_tab("upgrades");
                        }}
                      >
                        {c}
                      </a>
                    ),
                    A3: (c) => (
                      <A href="https://doc.cocalc.com/licenses.html">{c}</A>
                    ),
                    A4: (
                      <A href="https://doc.cocalc.com/paygo.html">
                        pay as you go
                      </A>
                    ),
                  }}
                />
              </span>
            }
          />
        </VisibleMDLG>
      );
  }

  function render_start_project_button() {
    const enabled =
      state == null ||
      !state?.get("state") ||
      (allowed &&
        ["opened", "closed", "archived"].includes(state?.get("state")));

    const txt = intl.formatMessage(
      {
        id: "project.start-button.button.txt",
        defaultMessage: `{starting, select, true {Starting project} other {Start project}}`,
        description:
          "Label on a button, either to start the project or indicating the project is currently starting.",
      },
      { starting },
    );

    return (
      <div>
        <Button
          type="primary"
          size="large"
          disabled={!enabled}
          onClick={async () => {
            try {
              await redux.getActions("projects").start_project(project_id);
            } catch (err) {
              // ui should show this some other way
              console.warn("WARNING -- issue starting project ", err);
            }
          }}
        >
          <Space>
            {starting ? <Icon name="cocalc-ring" spin /> : <Icon name="play" />}
            {txt}
          </Space>
        </Button>
      </div>
    );
  }

  // In case user is admin viewing another user's project, we provide a
  // special mode.
  function render_admin_view() {
    return (
      <Alert
        banner={true}
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
        banner={true}
        showIcon={false}
        message={
          <>
            <span
              style={{
                fontSize: "20pt",
                color: COLORS.GRAY_D,
              }}
            >
              <ProjectState state={state} show_desc={allowed} />
            </span>
            {render_start_project_button()}
            {render_not_allowed()}
          </>
        }
        type="info"
      />
    );
  }

  return (
    <div style={STYLE}>
      {state == null && redux.getStore("account")?.get("is_admin")
        ? render_admin_view()
        : render_normal_view()}
    </div>
  );
}
