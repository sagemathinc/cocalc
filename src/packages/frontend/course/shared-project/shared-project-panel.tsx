/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */
import { UsergroupAddOutlined } from "@ant-design/icons";
import { Button, Card, Popconfirm } from "antd";
import { FormattedMessage, useIntl } from "react-intl";

import { AppRedux, useActions } from "@cocalc/frontend/app-framework";
import { Icon, Paragraph } from "@cocalc/frontend/components";
import { course } from "@cocalc/frontend/i18n";
import { CancelText } from "@cocalc/frontend/i18n/components";
import { CourseActions } from "../actions";
import { CourseSettingsRecord } from "../store";
import { DeleteSharedProjectPanel } from "./delete-shared-project";

interface SharedProjectPanelProps {
  settings: CourseSettingsRecord;
  redux: AppRedux;
  name: string;
  close?: Function;
}

export function SharedProjectPanel({
  settings,
  redux,
  name,
  close,
}: SharedProjectPanelProps) {
  const intl = useIntl();

  const actions = useActions<CourseActions>({ name });

  const haveSharedProject = !!settings.get("shared_project_id");

  function panel_header_text(): string {
    return intl.formatMessage(
      {
        id: "course.shared-project-panel.header",
        defaultMessage: `{haveSharedProject, select,
        true {Shared project that everybody can fully use}
        other {Optionally create a shared project for everybody}}`,
      },
      { haveSharedProject },
    );
  }

  function render_content() {
    if (haveSharedProject) {
      return render_has_shared_project();
    } else {
      return render_no_shared_project();
    }
  }

  const icuVals = {
    b: (c) => <b>{c}</b>,
    i: (c) => <i>{c}</i>,
    p: (c) => <Paragraph>{c}</Paragraph>,
    secondary: (c) => <Paragraph type="secondary">{c}</Paragraph>,
  };

  function render_has_shared_project() {
    return (
      <>
        <FormattedMessage
          id="course.shared-project-panel.have_project.message"
          defaultMessage={`
            <p>
              You created a common shared project, which everybody – students and
              all collaborators on this project (your TAs and other instructors)
              – have <b>write</b> access to. Use this project for collaborative
              in-class labs, course-wide chat rooms, and making miscellaneous
              materials available for students to experiment with together.
            </p>
            <secondary>
              When you created the shared project, everybody who has already
              created an account is added as a collaborator to the project.
              Whenever you re-open this course, any students or collaborators on
              the project that contains this course will be added to the shared
              project.
            </secondary>`}
          values={icuVals}
        />
        <br />
        <div style={{ textAlign: "center" }}>
          <Button onClick={open_project} size={"large"} type={"primary"}>
            <FormattedMessage
              id="course.shared-project-panel.have_project.button"
              defaultMessage={"Open shared project"}
            />
          </Button>
        </div>
        <hr />
        <DeleteSharedProjectPanel
          settings={settings}
          actions={actions}
          close={close}
        />
      </>
    );
  }

  function open_project(): void {
    redux.getActions("projects").open_project({
      project_id: settings.get("shared_project_id"),
    });
    close?.();
  }

  function render_no_shared_project() {
    return (
      <div>
        <FormattedMessage
          id="course.shared-project-panel.create_project.message"
          defaultMessage={`
            <p>
              <i>Optionally</i> create a single common shared project, which
              everybody – students and all collaborators on this project (your
              TAs and other instructors) – will have <b>write</b> access to. This
              can be useful for collaborative in-class labs, course-wide chat
              rooms, and making miscellanous materials available for students to
              experiment with together.
            </p>
            <secondary>
              When you create the shared project, everybody who has already
              created an account is added as a collaborator to the project.
              Whenever you re-open this course, any students or collaborators on
              the project that contains this course will be added to the shared
              project.
            </secondary>
            <secondary>
              After you create the shared project, consider upgrading via a
              membership or pay-as-you-go so it has the resources you need.
            </secondary>`}
          values={icuVals}
        />
        <br />
        <Popconfirm
          title={
            <div style={{ maxWidth: "400px" }}>
              <FormattedMessage
                id="course.shared-project-panel.create_project.confirmation"
                defaultMessage={`Are you sure you want to create a shared project
                and add all students in this course as collaborators?`}
              />
            </div>
          }
          onConfirm={() => {
            const actions = redux.getActions(name) as CourseActions;
            if (actions != null) {
              actions.shared_project.create();
              close?.();
            }
          }}
          okText={intl.formatMessage(course.create_shared_project)}
          cancelText={<CancelText />}
        >
          <Button size={"large"} icon={<UsergroupAddOutlined />}>
            {intl.formatMessage(course.create_shared_project)}...
          </Button>
        </Popconfirm>
      </div>
    );
  }

  return (
    <div className="smc-vfill" style={{ overflow: "auto" }}>
      <Card
        style={{ maxWidth: "800px", margin: "auto" }}
        title={
          <>
            <Icon name="users" /> {panel_header_text()}
          </>
        }
      >
        {render_content()}
      </Card>
    </div>
  );
}
