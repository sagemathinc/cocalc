/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Card, Checkbox } from "antd";
import { isEqual } from "lodash";
import { useEffect, useRef, useState } from "react";
import { defineMessage, FormattedMessage, useIntl } from "react-intl";

import {
  redux,
  useIsMountedRef,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { Icon, Paragraph, Tip } from "@cocalc/frontend/components";
import { course, IntlMessage, labels } from "@cocalc/frontend/i18n";
import { R_IDE } from "@cocalc/util/consts/ui";
import type { StudentProjectFunctionality } from "@cocalc/util/db-schema/projects";

export type { StudentProjectFunctionality };

interface Option {
  name: string;
  title: IntlMessage;
  description: IntlMessage;
  isCoCalcCom?: boolean;
  notImplemented?: boolean;
}

const OPTIONS: Option[] = [
  {
    name: "disableActions",
    title: defineMessage({
      id: "course.customize-student-project-functionality.disableActions.title",
      defaultMessage: "Disable file actions",
    }),
    description: defineMessage({
      id: "course.customize-student-project-functionality.disableActions.description",
      defaultMessage:
        "Make it so students can't delete, download, copy, publish, etc., files in their project.  See the Disable Publish sharing option below if you just want to disable publishing.",
    }),
  },
  {
    name: "disableJupyterToggleReadonly",
    title: defineMessage({
      id: "course.customize-student-project-functionality.disableJupyterToggleReadonly.title",
      defaultMessage:
        "Disable toggling whether cells are editable or deletable",
    }),
    description: defineMessage({
      id: "course.customize-student-project-functionality.disableJupyterToggleReadonly.description",
      defaultMessage:
        "Make it so that in Jupyter notebooks, students can't toggle whether cells are editable or deletable, and also disables the RAW Json Editor and the Jupyter command list dialog.  If you set this, you should probably disable all of the JupyterLab and Jupyter classic options too.",
    }),
  },
  {
    name: "disableJupyterClassicServer",
    title: defineMessage({
      id: "course.customize-student-project-functionality.disableJupyterClassicServer.title",
      defaultMessage: "Disable Jupyter Classic notebook server",
    }),
    description: defineMessage({
      id: "course.customize-student-project-functionality.disableJupyterClassicServer.description",
      defaultMessage:
        "Disable the user interface for running a Jupyter classic server in student projects.  This is important, since Jupyter classic provides its own extensive download and edit functionality; moreover, you may want to disable Jupyter classic to reduce confusion if you don't plan to use it.",
    }),
  },
  {
    name: "disableJupyterLabServer",
    title: defineMessage({
      id: "course.customize-student-project-functionality.disableJupyterLabServer.title",
      defaultMessage: "Disable JupyterLab notebook server",
    }),
    description: defineMessage({
      id: "course.customize-student-project-functionality.disableJupyterLabServer.description",
      defaultMessage:
        "Disable the user interface for running a JupyterLab server in student projects.  This is important, since JupyterLab it provides its own extensive download and edit functionality; moreover, you may want to disable JupyterLab to reduce confusion if you don't plan to use it.",
    }),
  },
  {
    name: "disableVSCodeServer",
    title: defineMessage({
      id: "course.customize-student-project-functionality.disableVSCodeServer.title",
      defaultMessage: "Disable VS Code IDE Server",
    }),
    description: defineMessage({
      id: "course.customize-student-project-functionality.disableVSCodeServer.description",
      defaultMessage:
        "Disable the VS Code IDE Server, which lets you run VS Code in a project with one click.",
    }),
  },
  {
    name: "disablePlutoServer",
    title: defineMessage({
      id: "course.customize-student-project-functionality.disablePlutoServer.title",
      defaultMessage: "Disable Pluto Julia notebook server",
    }),
    description: defineMessage({
      id: "course.customize-student-project-functionality.disablePlutoServer.description",
      defaultMessage:
        "Disable the user interface for running a pluto server in student projects.  Pluto lets you run Julia notebooks from a project.",
    }),
  },
  {
    name: "disableRServer",
    title: defineMessage({
      id: "course.customize-student-project-functionality.disableRServer.title",
      defaultMessage: "{R_IDE}",
    }),
    description: defineMessage({
      id: "course.customize-student-project-functionality.disableRServer.description",
      defaultMessage: `Disable the user interface for running the {R_IDE} server in student projects.  This is an IDE for coding in R.`,
    }),
  },
  {
    name: "disableTerminals",
    title: defineMessage({
      id: "course.customize-student-project-functionality.disableTerminals.title",
      defaultMessage: "Disable command line terminal",
    }),
    description: defineMessage({
      id: "course.customize-student-project-functionality.disableTerminals.description",
      defaultMessage:
        "Disables opening or running command line terminals in student projects.",
    }),
  },
  {
    name: "disableUploads",
    title: defineMessage({
      id: "course.customize-student-project-functionality.disableUploads.title",
      defaultMessage: "Disable file uploads",
    }),
    description: defineMessage({
      id: "course.customize-student-project-functionality.disableUploads.description",
      defaultMessage:
        "Blocks uploading files to the student project via drag-n-drop or the Upload button.",
    }),
  },
  {
    name: "disableLibrary",
    title: defineMessage({
      id: "course.customize-student-project-functionality.disableLibrary.title",
      defaultMessage: "Disable Library",
    }),
    description: defineMessage({
      id: "course.customize-student-project-functionality.disableLibrary.description",
      defaultMessage:
        "In the file explorer there is a library button for browsing and copying books and tutorials into a project.  Disable this to simplify the interface.",
    }),
  },
  {
    name: "disableCollaborators",
    title: defineMessage({
      id: "course.customize-student-project-functionality.disableCollaborators.title",
      defaultMessage: "Disable adding or removing collaborators",
    }),
    description: defineMessage({
      id: "course.customize-student-project-functionality.disableCollaborators.description",
      defaultMessage:
        "Removes the user interface for adding or removing collaborators from student projects.",
    }),
  },
  //   {
  //     notImplemented: true,
  //     name: "disableAPI",
  //     title: "Disable API keys",
  //     description:
  //       "Makes it so the HTTP API is blocked from accessing the student project.  A student might use the API to get around various other restrictions.",
  //   },
  {
    name: "disableNetwork",
    title: defineMessage({
      id: "course.customize-student-project-functionality.disableNetwork.title",
      defaultMessage: "Disable outgoing network access",
    }),
    description: defineMessage({
      id: "course.customize-student-project-functionality.disableNetwork.description",
      defaultMessage:
        "Blocks all outgoing network connections from the student projects.",
    }),
    isCoCalcCom: true,
  },
  {
    name: "disableNetworkWarningBanner",
    title: defineMessage({
      id: "course.customize-student-project-functionality.disableNetworkWarningBanner.title",
      defaultMessage: "Disable outgoing network access warning banner",
    }),
    description: defineMessage({
      id: "course.customize-student-project-functionality.disableNetworkWarningBanner.description",
      defaultMessage:
        "Disables the banner at the top of the screen that warns students that network access is disabled.",
    }),
    isCoCalcCom: true,
  },
  {
    name: "disableSSH",
    title: defineMessage({
      id: "course.customize-student-project-functionality.disableSSH.title",
      defaultMessage: "Disable SSH access to project",
    }),
    description: defineMessage({
      id: "course.customize-student-project-functionality.disableSSH.description",
      defaultMessage: "Makes any attempt to ssh to a student project fail.",
    }),
    isCoCalcCom: true,
  },
  {
    name: "disableChatGPT",
    title: defineMessage({
      id: "course.customize-student-project-functionality.disableChatGPT.title",
      defaultMessage: "Disable all AI integration (ChatGPT & co.)",
    }),
    description: defineMessage({
      id: "course.customize-student-project-functionality.disableChatGPT.description",
      defaultMessage:
        "Remove *all* AI integrations (ChatGPT & co.) from the student projects.  This is a hint for honest students, since of course students can still use copy/paste to accomplish the same thing.",
    }),
  },
  {
    name: "disableSomeChatGPT",
    title: defineMessage({
      id: "course.customize-student-project-functionality.disableSomeChatGPT.title",
      defaultMessage: "Disable some AI integration (ChatGPT & co.)",
    }),
    description: defineMessage({
      id: "course.customize-student-project-functionality.disableSomeChatGPT.description",
      defaultMessage:
        "Disable AI integration (ChatGPT & co.) except that 'Help me fix' and 'Explain' buttons.  Use this if you only want the students to use AI assistance to get unstuck.",
    }),
  },
  {
    name: "disableSharing",
    title: defineMessage({
      id: "course.customize-student-project-functionality.disableSharing.title",
      defaultMessage: "Disable Public sharing",
    }),
    description: defineMessage({
      id: "course.customize-student-project-functionality.disableSharing.description",
      defaultMessage:
        "Disable public sharing of files from the student projects.  This is a hint for honest students, since of course students can still download files or even copy them to another project and share them.  This does not change the share status of any files that are currently shared.",
    }),
  },
] as const;

interface Props {
  functionality: StudentProjectFunctionality;
  onChange: (StudentProjectFunctionality) => Promise<void>;
}

export function CustomizeStudentProjectFunctionality({
  functionality,
  onChange,
}: Props) {
  const intl = useIntl();
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

  const lastFunctionalityRef =
    useRef<StudentProjectFunctionality>(functionality);
  useEffect(() => {
    if (isEqual(functionality, lastFunctionalityRef.current)) {
      return;
    }
    // some sort of upstream change
    lastFunctionalityRef.current = functionality;
    setState(functionality);
  }, [functionality]);

  function renderOption(option: Option) {
    const { name } = option;
    const description = intl.formatMessage(option.description, { R_IDE });

    let title = intl.formatMessage(option.title, { R_IDE });
    if (option.notImplemented) {
      const msg = intl.formatMessage(labels.not_implemented).toUpperCase();
      title += ` (${msg})`;
    }

    return (
      <Tip key={name} title={title} tip={description}>
        <Checkbox
          disabled={saving}
          checked={state[name]}
          onChange={(e) =>
            onChangeState({
              [name]: (e.target as any).checked,
            })
          }
        >
          {title}
        </Checkbox>
        <br />
      </Tip>
    );
  }

  const options: React.JSX.Element[] = [];
  for (const option of OPTIONS) {
    if (option.isCoCalcCom && !isCoCalcCom) continue;
    options.push(renderOption(option));
  }

  const title = intl.formatMessage(course.restrict_student_projects);

  return (
    <Card
      title={
        <>
          <Icon name="lock" /> {title}
        </>
      }
    >
      <Paragraph type="secondary">
        <FormattedMessage
          id="course.customize-student-project-functionality.description"
          defaultMessage={`Check any of the boxes below
          to remove the corresponding functionality from all student projects.
          Hover over an option for more information about what it disables.
          This is useful to reduce student confusion and keep the students more focused,
          e.g., during an exam.
          <i>
            Do not gain a false sense of security and expect these to prevent all forms of cheating.
          </i>`}
        />
      </Paragraph>
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
            {intl.formatMessage(labels.save_changes)}
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function completeStudentProjectFunctionality(
  x: StudentProjectFunctionality,
) {
  const y = { ...x };
  for (const { name } of OPTIONS) {
    if (y[name] == null) {
      y[name] = false;
    }
  }
  return y;
}

// NOTE: we allow project_id to be undefined for convenience since some clients
// were written with that unlikely assumption on their knowledge of project_id.
type Hook = (project_id?: string) => StudentProjectFunctionality;
export const useStudentProjectFunctionality: Hook = (project_id?: string) => {
  const project_map = useTypedRedux("projects", "project_map") as any;
  const [state, setState] = useState<StudentProjectFunctionality>(
    project_map
      ?.getIn([project_id ?? "", "course", "student_project_functionality"])
      ?.toJS() ?? {},
  );
  useEffect(() => {
    setState(
      project_map
        ?.getIn([project_id ?? "", "course", "student_project_functionality"])
        ?.toJS() ?? {},
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
  project_id?: string,
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
