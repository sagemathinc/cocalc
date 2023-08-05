/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { isEqual } from "lodash";
import { Button, Card, Checkbox } from "antd";
import {
  redux,
  React,
  useEffect,
  useIsMountedRef,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { Icon, Tip } from "@cocalc/frontend/components";
import type { StudentProjectFunctionality } from "@cocalc/util/db-schema/projects";
export type { StudentProjectFunctionality };

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
      "Make it so students can't delete, download, copy, publish, etc., files in their project.  See the Disable Publish sharing option below if you just want to disable publishing.",
  },
  {
    name: "disableJupyterToggleReadonly",
    title: "toggling whether cells are editable or deletable",
    description:
      "Make it so that in Jupyter notebooks, students can't toggle whether cells are editable or deletable, and also disables the RAW Json Editor and the Jupyter command list dialog.  If you set this, you should probably disable all of the JupyterLab and Jupyter classic options too.",
  },
  {
    name: "disableJupyterClassicServer",
    title: "Jupyter Classic notebook server",
    description:
      "Disable the user interface for running a Jupyter classic server in student projects.  This is important, since Jupyter classic provides its own extensive download and edit functionality; moreover, you may want to disable Jupyter classic to reduce confusion if you don't plan to use it.",
  },
  {
    name: "disableJupyterClassicMode",
    title: "Jupyter Classic mode",
    description:
      "Do not allow opening Jupyter notebooks using classic mode.  The Jupyter classic UI has some workarounds for the other restrictions here, and can also cause confusion if you don't want students to use it in your class.",
  },
  {
    name: "disableJupyterLabServer",
    title: "JupyterLab notebook server",
    description:
      "Disable the user interface for running a JupyterLab server in student projects.  This is important, since JupyterLab it provides its own extensive download and edit functionality; moreover, you may want to disable JupyterLab to reduce confusion if you don't plan to use it.",
  },
  {
    name: "disableVSCodeServer",
    title: "VS Code IDE Server",
    description:
      "Disable the VS Code IDE Server, which lets you run VS Code in a project with one click.",
  },
  {
    name: "disablePlutoServer",
    title: "Pluto Julia notebook server",
    description:
      "Disable the user interface for running a pluto server in student projects.  Pluto lets you run Julia notebooks from a project.",
  },
  {
    name: "disableTerminals",
    title: "command line terminal",
    description:
      "Disables opening or running command line terminals in student projects.",
  },
  {
    name: "disableUploads",
    title: "file uploads",
    description:
      "Blocks uploading files to the student project via drag-n-drop or the Upload button.",
  },
  {
    name: "disableCollaborators",
    title: "adding or removing collaborators",
    description:
      "Removes the user interface for adding or removing collaborators from student projects.",
  },
  //   {
  //     notImplemented: true,
  //     name: "disableAPI",
  //     title: "API keys",
  //     description:
  //       "Makes it so the HTTP API is blocked from accessing the student project.  A student might use the API to get around various other restrictions.",
  //   },
  {
    isCoCalcCom: true,
    name: "disableNetwork",
    title: "outgoing network access",
    description:
      "Blocks all outgoing network connections from the student projects.",
  },
  {
    isCoCalcCom: true,
    name: "disableSSH",
    title: "SSH access to project",
    description: "Makes any attempt to ssh to a student project fail.",
  },
  {
    name: "disableChatGPT",
    title: "all ChatGPT integration",
    description:
      "Remove *all* ChatGPT integrations from the student projects.  This is a hint for honest students, since of course students can still use copy/paste to accomplish the same thing.",
  },
  {
    name: "disableSomeChatGPT",
    title: "some ChatGPT integration",
    description:
      "Disable ChatGPT integration except that 'Help me fix' and 'Explain' buttons.  Use this if you only want the students to  use ChatGPT to get unstuck.",
  },
  {
    name: "disableSharing",
    title: "Public sharing",
    description:
      "Disable public sharing of files from the student projects.  This is a hint for honest students, since of course students can still download files or even copy them to another project and share them.  This does not change the share status of any files that are currently shared.",
  },
];

interface Props {
  functionality: StudentProjectFunctionality;
  onChange: (StudentProjectFunctionality) => Promise<void>;
}

export const CustomizeStudentProjectFunctionality: React.FC<Props> = React.memo(
  ({ functionality, onChange }) => {
    const isCoCalcCom = useTypedRedux("customize", "is_cocalc_com");
    const [state, setState] =
      useState<StudentProjectFunctionality>(functionality);
    const [saving, setSaving] = useState<boolean>(false);
    function onChangeState(obj: StudentProjectFunctionality) {
      const newState = { ...state };
      for (const key in obj) {
        newState[key] = obj[key];
      }
      setState(newState);
    }
    const isMountedRef = useIsMountedRef();

    function renderOption(option) {
      let { title } = option;
      if (option.notImplemented) {
        title += " (NOT IMPLEMENTED)";
      }
      return (
        <Tip key={title} title={`Disable ${title}`} tip={option.description}>
          <Checkbox
            disabled={saving}
            defaultChecked={state[option.name]}
            onChange={(e) =>
              onChangeState({
                [option.name]: (e.target as any).checked,
              })
            }
          >
            Disable {title}
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
            <Icon name="lock" /> Restrict Student Projects
          </>
        }
      >
        <span style={{ color: "#666" }}>
          Check any of the boxes below to remove the corresponding functionality
          from student projects. Hover over an option for more information about
          what it disables. This is useful to reduce student confusion and keep
          the students more focused, e.g., during an exam.{" "}
          <i>
            Do not gain a false sense of security and expect these to prevent
            all forms of cheating.
          </i>
        </span>
        <hr />
        <div
          style={{
            border: "1px solid lightgrey",
            padding: "10px",
            borderRadius: "5px",
          }}
        >
          {options}
          <div style={{ marginTop: "8px" }}>
            <Button
              type="primary"
              disabled={saving || isEqual(functionality, state)}
              onClick={async () => {
                setSaving(true);
                await onChange(state);
                if (isMountedRef.current) {
                  setSaving(false);
                }
              }}
            >
              Save changes
            </Button>
          </div>
        </div>
      </Card>
    );
  }
);

// NOTE: we allow project_id to be undefined for convenience since some clients
// were written with that unlikely assumption on their knowledge of project_id.
type Hook = (project_id?: string) => StudentProjectFunctionality;
export const useStudentProjectFunctionality: Hook = (project_id?: string) => {
  const project_map = useTypedRedux("projects", "project_map") as any;
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

// Getting the information known right now about studnet project functionality.
// Similar to the above hook, but just a point in time snapshot.  Use this
// for old components that haven't been converted to react hooks yet.
export function getStudentProjectFunctionality(
  project_id?: string
): StudentProjectFunctionality {
  return (
    redux
      .getStore("projects")
      ?.getIn([
        "project_map",
        project_id ?? "",
        "course",
        "student_project_functionality",
      ])
      ?.toJS() ?? {}
  );
}
