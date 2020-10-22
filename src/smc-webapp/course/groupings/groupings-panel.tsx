/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Map } from "immutable";
import { React } from "../../app-framework";
import { CourseActions } from "../actions";
import { StudentRecord, GroupingRecord } from "../store";
import { Alert } from "antd";

interface Props {
  frame_id?: string;
  name: string;
  project_id: string;
  actions: CourseActions;
  students: Map<string, StudentRecord>;
  groupings: Map<string, GroupingRecord>;
}

export const GroupingsPanel: React.FC<Props> = ({ groupings }) => {
  function render_no_groupings(): JSX.Element {
    return (
      <Alert
        type="info"
        style={{ margin: "auto", fontSize: "12pt", maxWidth: "800px" }}
        message={
          <div>
            <h3>Group your Students to Encourage Collaboration</h3>
            <p>
              A <i>grouping</i> is way of dividing the students in your course
              up into named groups to encourage collaboration.
            </p>

            <p>
              A project is created for each group in the grouping, and all of
              the students in that group are added as collaborators on that
              project. Students can then work and chat amongst themselves in
              smaller groups, and also with you and your assistants.
            </p>
          </div>
        }
      />
    );
  }

  if (groupings.size == 0) {
    return render_no_groupings();
  }

  return (
    <div>
      <h3>Groupings</h3>
      <pre>{JSON.stringify(groupings.toJS(), undefined, 2)}</pre>
    </div>
  );
};
