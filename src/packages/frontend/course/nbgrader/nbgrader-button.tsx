/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Render the nbgrader button at the top of the assignment.
*/

import { Alert, Button, Popconfirm } from "antd";
import { redux, useActions, useRedux } from "../../app-framework";
import { useMemo, useState } from "react";
import { Icon, Gap, Tip } from "../../components";
import { CourseStore, NBgraderRunInfo, PARALLEL_DEFAULT } from "../store";
import { CourseActions } from "../actions";
import { nbgrader_status } from "./util";
import { plural } from "@cocalc/util/misc";
import { webapp_client } from "@cocalc/frontend/webapp-client";

interface Props {
  name: string;
  assignment_id: string;
}

export function NbgraderButton({ name, assignment_id }: Props) {
  const actions: undefined | CourseActions = useActions(name);
  const nbgrader_run_info: NBgraderRunInfo = useRedux([
    name,
    "nbgrader_run_info",
  ]);
  const assignment = useRedux([name, "assignments", assignment_id]);
  const [show_more_info, set_show_more_info] = useState<boolean>(false);
  const settings = useRedux([name, "settings"]);

  const status = useMemo(() => {
    const store: undefined | CourseStore = redux.getStore(name) as any;
    if (store == null) return;
    return nbgrader_status(assignment);
  }, [assignment]); // also depends on all student ids, but not worrying about that for now.

  const running = useMemo(() => {
    if (nbgrader_run_info == null) return false;
    const t = nbgrader_run_info.get(assignment_id);
    if (webapp_client.server_time() - (t ?? 0) <= 1000 * 60 * 10) {
      // Time starting is set and it's also within the last few minutes.
      // This "few minutes" is just in case -- we probably shouldn't need
      // that at all ever, but it could make cocalc state usable in case of
      // weird issues, I guess).  User could also just close and re-open
      // the course file, which resets this state completely.
      return true;
    }
    return false;
  }, [nbgrader_run_info]);

  function render_parallel() {
    const n = settings.get("nbgrader_parallel") ?? PARALLEL_DEFAULT;
    return (
      <Tip
        title={`nbgrader parallel limit: grade ${n} students at once`}
        tip="This is the max number of students to grade in parallel.  Change this in course configuration."
      >
        <div style={{ marginTop: "5px", fontWeight: 400 }}>
          Grade up to {n} students at once.
        </div>
      </Tip>
    );
  }

  function render_more_info() {
    if (status == null) return <span />;
    const todo = status.not_attempted + status.failed;
    const total = status.attempted + status.not_attempted;
    const failed =
      status.failed > 0 ? ` ${status.failed} failed autograding.` : "";
    const not_attempted =
      status.not_attempted > 0
        ? ` ${status.not_attempted} not autograded.`
        : "";
    return (
      <Alert
        style={{ marginTop: "5px" }}
        type="success"
        message={
          <span style={{ fontSize: "14px" }}>
            Autograded {status.succeeded}/{total} assignments.{failed}
            {not_attempted}
          </span>
        }
        description={
          <div>
            {todo > 0 && (
              <span>
                <br />
                <Button
                  disabled={running}
                  type={"primary"}
                  onClick={() => {
                    actions?.assignments.run_nbgrader_for_all_students(
                      assignment_id,
                      true,
                    );
                  }}
                >
                  Autograde {todo} not-graded {plural(todo, "assignment")}
                </Button>
              </span>
            )}
            {status.attempted > 0 && (
              <span>
                <br />
                <Popconfirm
                  title={`Are you sure you want to autograde ALL ${total} ${plural(
                    total,
                    "student",
                  )}?`}
                  onConfirm={() => {
                    actions?.assignments.run_nbgrader_for_all_students(
                      assignment_id,
                    );
                  }}
                >
                  <Button
                    danger
                    style={{
                      width: "100%",
                      overflow: "hidden",
                    }}
                    disabled={running}
                  >
                    Autograde all {total} {plural(total, "assignment")}...
                  </Button>
                </Popconfirm>
              </span>
            )}
            {render_parallel()}
            {actions && (
              <SyncGrades
                actions={actions}
                assignment_id={assignment_id}
                running={running}
              />
            )}
          </div>
        }
      />
    );
  }

  const label = running ? (
    <span>
      {" "}
      <Icon name="cocalc-ring" spin />
      <Gap /> nbgrader is running
    </span>
  ) : (
    <span>nbgrader...</span>
  );
  return (
    <div style={{ margin: "5px 0" }}>
      <Button onClick={() => set_show_more_info(!show_more_info)}>
        <Icon
          style={{ width: "20px" }}
          name={show_more_info ? "caret-down" : "caret-right"}
        />
        <Gap /> {label}
      </Button>
      {show_more_info && render_more_info()}
    </div>
  );
}

interface SyncGradesProps {
  actions: CourseActions;
  assignment_id: string;
  running: boolean;
}

function SyncGrades({ actions, assignment_id, running }: SyncGradesProps) {
  return (
    <Popconfirm
      title={`Copy the nbgrader grades to be the assigned grades for all students, even if there are ungraded manual problems, errors or other issues?  You probably don't need to do this.`}
      onConfirm={() => {
        actions.assignments.set_nbgrader_scores_for_all_students({
          assignment_id,
          force: true,
          commit: true,
        });
      }}
      overlayStyle={{ maxWidth: "500px" }}
    >
      <Button
        style={{
          marginTop: "10px",
          width: "100%",
          overflow: "hidden",
        }}
        disabled={running}
      >
        Sync grades...
      </Button>
    </Popconfirm>
  );
}
