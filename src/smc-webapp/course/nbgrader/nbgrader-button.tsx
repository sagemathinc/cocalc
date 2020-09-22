/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Render the nbgrader button at the top of the assignment.
*/

import { Alert, Button, Popconfirm } from "antd";
import {
  React,
  redux,
  useActions,
  useMemo,
  useRedux,
  useState,
} from "../../app-framework";
import { Icon, Space } from "../../r_misc";
import { CourseStore, NBgraderRunInfo } from "../store";
import { CourseActions } from "../actions";
import { nbgrader_status } from "./util";
import { plural } from "smc-util/misc2";

interface Props {
  name: string;
  assignment_id: string;
}

export const NbgraderButton: React.FC<Props> = React.memo(
  ({ name, assignment_id }) => {
    const actions: undefined | CourseActions = useActions(name);
    const nbgrader_run_info: NBgraderRunInfo = useRedux([
      name,
      "nbgrader_run_info",
    ]);
    const assignment = useRedux([name, "assignments", assignment_id]);
    const [show_more_info, set_show_more_info] = useState<boolean>(false);

    const status = useMemo(() => {
      const store: undefined | CourseStore = redux.getStore(name) as any;
      if (store == null) return;
      return nbgrader_status(assignment);
    }, [assignment]); // also depends on all student ids, but not worrying about that for now.

    function render_more_info() {
      if (status == null) return <span />;
      const todo = status.not_attempted + status.failed;
      const total = status.attempted + status.not_attempted;
      const failed = status.failed > 0 ? ` ${status.failed} failed.` : "";
      const not_attempted =
        status.not_attempted > 0 ? ` ${status.not_attempted} not graded.` : "";
      return (
        <Alert
          style={{ marginTop: "5px" }}
          type="success"
          message={`Graded ${status.succeeded}/${total} students.${failed}${not_attempted}`}
          description={
            <div>
              {todo > 0 && (
                <span>
                  <br />
                  <Button
                    type={"primary"}
                    onClick={() => {
                      actions?.assignments.run_nbgrader_for_all_students(
                        assignment_id
                      );
                    }}
                  >
                    Autograde {todo} not graded {plural(todo, "student")}
                  </Button>
                </span>
              )}
              {status.attempted > 0 && (
                <span>
                  <br />
                  <Popconfirm
                    title={`Are you sure you want to autograde ALL ${total} ${plural(
                      total,
                      "student"
                    )}?`}
                    onConfirm={() => {
                      actions?.assignments.run_nbgrader_for_all_students(
                        assignment_id
                      );
                    }}
                  >
                    <Button danger style={{ marginTop: "5px" }}>
                      Grade all {total} {plural(total, "student")}...
                    </Button>
                  </Popconfirm>
                </span>
              )}
            </div>
          }
        />
      );
    }

    let running = false;
    if (nbgrader_run_info != null) {
      const t = nbgrader_run_info.get(assignment_id);
      if (t && new Date().valueOf() - t <= 1000 * 60 * 10) {
        // Time starting is set and it's also within the last few minutes.
        // This "few minutes" is just in case -- we probably shouldn't need
        // that at all ever, but it could make cocalc state usable in case of
        // weird issues, I guess).  User could also just close and re-open
        // the course file, which resets this state completely.
        running = true;
      }
    }
    const label = running ? (
      <span>
        {" "}
        <Icon name="cc-icon-cocalc-ring" spin />
        <Space /> Nbgrader is running
      </span>
    ) : (
      <span>Nbgrader...</span>
    );
    return (
      <div style={{ margin: "5px 0" }}>
        <Button onClick={() => set_show_more_info(!show_more_info)}>
          <Icon
            style={{ width: "20px" }}
            name={show_more_info ? "caret-down" : "caret-right"}
          />
          <Space /> {label}
        </Button>
        {show_more_info && render_more_info()}
      </div>
    );
  }
);
