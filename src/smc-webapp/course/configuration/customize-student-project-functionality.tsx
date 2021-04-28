/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { isEqual } from "lodash";
import { Card, Checkbox } from "antd";
import { Button } from "smc-webapp/antd-bootstrap";
import {
  React,
  useEffect,
  useIsMountedRef,
  useState,
  useTypedRedux,
} from "smc-webapp/app-framework";
import { Icon, Tip } from "smc-webapp/r_misc";

export interface StudentProjectFunctionality {
  disableActions?: boolean;
  disableJupyterToggleReadonly?: boolean;
  disableJupyterClassicServer?: boolean;
  disableJupyterLabServer?: boolean;
  disableTerminals?: boolean;
  disableUploads?: boolean;
  disableNetwork?: boolean;
  disableSSH?: boolean;
  disableCollaborators?: boolean;
}

interface Option {
  name: string;
  title: string;
  description: string;
  isCoCalcCom?: boolean;
  notImplemented?: boolean;
}

const OPTIONS: Option[] = [
  {
    name: "disableActions",
    title: "file actions",
    description:
      "Make it so students can't delete, download, copy, publish, etc., files in their project.",
  },
  {
    name: "disableJupyterToggleReadonly",
    title: "toggling whether cells are editable or deletable",
    description:
      "Make it so that in Jupyter notebooks, students can't toggle whether cells are editable or deletable, and also disables the RAW Json Editor and the Jupyter command list dialog.",
  },
  {
    name: "disableJupyterClassicServer",
    title: "Jupyter Classic notebook server",
    description:
      "Disable the user interface for running a Jupyter classic server in the student project.  This is important, since Jupyter classic provides its own extensive download and edit functionality; moreover, you may want to disable Jupyter classic to reduce confusion if you don't plan to use it.",
  },
  {
    notImplemented: true,
    name: "disableJupyterClassicMode",
    title: "Jupyter Classic mode",
    description:
      "Do not allow opening Jupyter notebooks using classic mode.  The Jupyter classic UI has some workarounds for the other restrictions here, and can also cause confusion if you don't want students to use it in your class.",
  },
  {
    name: "disableJupyterLabServer",
    title: "JupyterLab notebook server",
    description:
      "Disable the user interface for running a JupyterLab server in the student project.  This is important, since JupyterLab it provides its own extensive download and edit functionality; moreover, you may want to disable JupyterLab to reduce confusion if you don't plan to use it.",
  },
  {
    name: "disableTerminals",
    title: "command line terminal",
    description:
      "Disables opening or running command line terminals in the student project.",
  },
  {
    name: "disableUploads",
    title: "file uploads",
    description:
      "Blocks uploading files to the student project via drag-n-drop or the Upload button.",
  },
  {
    notImplemented: true,
    name: "disableCollaborators",
    title: "adding or removing collaborators",
    description:
      "Removes the user interface for adding or removing collaborators from the student project.",
  },
  {
    notImplemented: true,
    name: "disableAPI",
    title: "API keys",
    description:
      "Makes it so the HTTP API is blocked from accessing the student project.  A student might use the API to get around various other restrictions.",
  },
  {
    isCoCalcCom: true,
    name: "disableNetwork",
    title: "outgoing network access",
    description:
      "Blocks all outgoing network connections from the student project.",
  },
  {
    isCoCalcCom: true,
    name: "disableSSH",
    title: "SSH access to project",
    description: "Makes any attempt to ssh to the student project fail.",
  },
];

interface Props {
  functionality: StudentProjectFunctionality;
  onChange: (StudentProjectFunctionality) => Promise<void>;
}

export const CustomizeStudentProjectFunctionality: React.FC<Props> = React.memo(
  ({ functionality, onChange }) => {
    const isCoCalcCom = useTypedRedux("customize", "is_cocalc_com");
    const [changed, setChanged] = useState<boolean>(false);
    const [state, setState] = useState<StudentProjectFunctionality>(
      functionality
    );
    const [saving, setSaving] = useState<boolean>(false);
    function onChangeState(obj: StudentProjectFunctionality) {
      const newState = { ...state };
      setChanged(true);
      for (const key in obj) {
        newState[key] = obj[key];
      }
      setState(newState);
    }
    const isMountedRef = useIsMountedRef();

    useEffect(() => {
      // upstream change (e.g., another user editing these)
      setState(functionality);
    }, [functionality]);

    function renderOption(option) {
      let { title } = option;
      if (option.notImplemented) {
        title += " (NOT IMPLEMENTED)";
      }
      return (
        <Tip title={`Disable ${title}`} tip={option.description}>
          <Checkbox
            disabled={saving}
            checked={state[option.name]}
            onChange={(e) =>
              onChangeState({
                [option.name]: (e.target as any).checked,
              })
            }
          >
            <span style={{ fontWeight: 500 }}>Disable {title}</span>
          </Checkbox>
          <br />
        </Tip>
      );
    }

    const options: JSX.Element[] = [];
    for (const option of OPTIONS) {
      if (option.isCoCalcCom && !isCoCalcCom) continue;
      options.push(renderOption(option));
    }

    return (
      <Card
        title={
          <>
            <Icon name="lock" /> Restrict student projects
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
          {options}
          {(changed || !isEqual(functionality, state)) && (
            <div>
              <br />
              <Button
                disabled={saving || isEqual(functionality, state)}
                onClick={async () => {
                  setSaving(true);
                  await onChange(state);
                  if (isMountedRef.current) {
                    setSaving(false);
                  }
                }}
                bsStyle={"success"}
              >
                Save changes
              </Button>
            </div>
          )}
        </div>
        <hr />
        <span style={{ color: "#666" }}>
          Check any of the boxes above to remove the corresponding functionality
          from student projects. Hover over an option for more information about
          what it disables. This is useful to reduce student confusion and keep
          the students more focused, e.g., during an exam.{" "}
          <i>
            Do not gain a false sense of security and expect these to prevent
            all forms of cheating.
          </i>
        </span>
      </Card>
    );
  }
);

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
