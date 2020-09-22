/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Render the nbgrader button at the top of the assignment.
*/

import { Button } from "antd";
import { React, useActions, useRedux } from "../../app-framework";
import { Icon, Space } from "../../r_misc";
import { NBgraderRunInfo } from "../store";
import { CourseActions } from "../actions";

interface Props {
  name: string;
  assignment_id: string;
}

export const NbgraderButton: React.FC<Props> = ({ name, assignment_id }) => {
  const actions: undefined | CourseActions = useActions(name);
  const nbgrader_run_info: NBgraderRunInfo = useRedux([
    name,
    "nbgrader_run_info",
  ]);

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
    <span>Run nbgrader...</span>
  );
  return (
    <div style={{ margin: "5px 0" }}>
      <Button
        disabled={running}
        onClick={() => {
          actions?.assignments.run_nbgrader_for_all_students(assignment_id);
        }}
      >
        <Icon name="graduation-cap" />
        <Space /> {label}
      </Button>
    </div>
  );
};
