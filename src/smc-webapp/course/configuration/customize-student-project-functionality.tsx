/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Card, Checkbox } from "antd";
import { React } from "../../app-framework";
import { Icon } from "../../r_misc";

export interface StudentProjectFunctionality {
  disableActions?: boolean;
  disableJupyterToggleReadonly?: boolean;
  disableTerminals?: boolean;
}

interface Props {
  functionality: StudentProjectFunctionality;
  onChange: (StudentProjectFunctionality) => void;
}

export const CustomizeStudentProjectFunctionality: React.FC<Props> = React.memo(
  ({ functionality, onChange }) => {
    return (
      <Card
        title={
          <>
            <Icon name="envelope" /> Lockdown student projects
          </>
        }
      >
        <div
          style={{
            border: "1px solid lightgrey",
            padding: "10px",
            borderRadius: "5px",
          }}
        >
          <Checkbox
            checked={functionality.disableActions}
            onChange={(e) =>
              onChange({ disableActions: (e.target as any).checked })
            }
          >
            Disable file actions: deleting, downloading, copying and publishing
            files
          </Checkbox>
          <br />

          <Checkbox
            checked={functionality.disableJupyterToggleReadonly}
            onChange={(e) =>
              onChange({
                disableJupyterToggleReadonly: (e.target as any).checked,
              })
            }
          >
            Disable toggling of whether cells are editable or deletable in
            Jupyter notebooks
          </Checkbox>

          <br />
          <Checkbox
            checked={functionality.disableTerminals}
            onChange={(e) =>
              onChange({
                disableTerminals: (e.target as any).checked,
              })
            }
          >
            Disable command line terminal
          </Checkbox>
        </div>
        <hr />
        <span style={{ color: "#666" }}>
          Check any of the boxes above to remove the corresponding functionality
          from student projects. This is useful to reduce student confusion and
          keep the students more focused, e.g., during an exam. Do not expect
          these to prevent very highly motivated cheaters, since a resourceful
          and knowledgeable student could potentially get around these
          constraints, e.g., by doing a bunch of copying and pasting by hand. Of
          course such manual cheating is more likely to leave a distinct trail.
          Use the above features to also reduce the chances students get
          confused and mess up their work. Checking either of the above also
          disables the Jupyter classic and JupyterLab servers, since they have
          equivalent functionality built in.
        </span>
      </Card>
    );
  }
);

import { useEffect, useTypedRedux, useState } from "smc-webapp/app-framework";

// NOTE: we allow project_id to be undefined for convenience since some clients
// were written with that unlikely assumption on their knowledge of project_id.
export const useStudentProjectFunctionality = (project_id?: string) => {
  const project_map = useTypedRedux("projects", "project_map");
  const [state, setState] = useState<StudentProjectFunctionality>(
    project_map
      ?.getIn([project_id ?? "", "course", "student_project_functionality"])
      ?.toJS() ?? {}
  );
  useEffect(() => {
    setState(
      project_map
        ?.getIn([project_id ?? "", "course", "student_project_functionality"])
        ?.toJS() ?? {}
    );
    return;
  }, [
    project_map?.getIn([
      project_id ?? "",
      "course",
      "student_project_functionality",
    ]),
  ]);

  return state;
};
