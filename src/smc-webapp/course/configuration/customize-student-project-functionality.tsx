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
        </div>
        <hr />
        <span style={{ color: "#666" }}>
          Check either of the boxes above to remove the corresponding
          functionality from student projects. This is useful to reduce student
          confusion and keep the students more focused. Do not use these to
          prevent highly motivated cheaters, since a very resourceful and
          knowledgeable student can likely get around these constraints, e.g.,
          by using a command line terminal or doing a bunch of copying and
          pasting. Use the above instead to reduce the chances students get
          confused and mess up their work.
        </span>
      </Card>
    );
  }
);

import { useEffect, useTypedRedux, useState } from "smc-webapp/app-framework";
export const useStudentProjectFunctionality = (project_id: string) => {
  const project_map = useTypedRedux("projects", "project_map");
  const [state, setState] = useState<StudentProjectFunctionality>(
    project_map
      ?.getIn([project_id, "course", "student_project_functionality"])
      ?.toJS() ?? {}
  );
  useEffect(() => {
    setState(
      project_map
        ?.getIn([project_id, "course", "student_project_functionality"])
        ?.toJS() ?? {}
    );
    return;
  }, [
    project_map?.getIn([project_id, "course", "student_project_functionality"]),
  ]);

  return state;
};
