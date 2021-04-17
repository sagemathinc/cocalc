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
  disableJupyterClassicServer?: boolean;
  disableJupyterLabServer?: boolean;
  disableTerminals?: boolean;
  disableUploads?: boolean;
  disableNetwork?: boolean;
  disableSSH?: boolean;
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
            <Icon name="lock" /> Lockdown student projects
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
            of files
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
            Jupyter notebooks (also disables the RAW JSON editor and the command
            list dialog)
          </Checkbox>
          <br />
          <Checkbox
            checked={functionality.disableJupyterClassicServer}
            onChange={(e) =>
              onChange({
                disableJupyterClassicServer: (e.target as any).checked,
              })
            }
          >
            Disable Jupyter Classic notebook server, which provides its own
            extensive download and edit functionality.
          </Checkbox>{" "}
          <br />
          <Checkbox
            checked={functionality.disableJupyterLabServer}
            onChange={(e) =>
              onChange({
                disableJupyterLabServer: (e.target as any).checked,
              })
            }
          >
            Disable JupyterLab notebook server, which provides its own extensive
            download and edit functionality.
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
          <br />
          <Checkbox
            checked={functionality.disableUploads}
            onChange={(e) =>
              onChange({
                disableUploads: (e.target as any).checked,
              })
            }
          >
            Disable files uploads
          </Checkbox>
          <br />
          <Checkbox
            checked={functionality.disableNetwork}
            onChange={(e) =>
              onChange({
                disableNetwork: (e.target as any).checked,
              })
            }
          >
            Disable outgoing network access (NOT implemented)
          </Checkbox>
          <br />
          <Checkbox
            checked={functionality.disableSSH}
            onChange={(e) =>
              onChange({
                disableSSH: (e.target as any).checked,
              })
            }
          >
            Disable SSH access to project (NOT implemented)
          </Checkbox>
        </div>
        <hr />
        <span style={{ color: "#666" }}>
          Check any of the boxes above to remove the corresponding functionality
          from student projects. This is useful to reduce student confusion and
          keep the students more focused, e.g., during an exam.{" "}
          <i>
            Do not gain a false sense of security and expect these to prevent
            very highly motivated cheaters!
          </i>{" "}
          -- a resourceful and knowledgeable student could potentially get
          around these constraints, e.g., by doing a bunch of copying and
          pasting by hand. Use the above features to also reduce the chances
          students get confused and mess up their work. For example, you might
          want to disable Jupyter classic in a class that is using JupyterLab
          extensively.
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
