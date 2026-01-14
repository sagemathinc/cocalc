/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Card, Col, Row, Spin } from "antd";
import { debounce } from "lodash";
import { FormattedMessage, useIntl } from "react-intl";

import {
  redux,
  useActions,
  useState,
  useStore,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import {
  Icon,
  LabeledRow,
  MarkdownInput,
  TextInput,
} from "@cocalc/frontend/components";
import ShowError from "@cocalc/frontend/components/error";
import { course } from "@cocalc/frontend/i18n";
import { contains_url } from "@cocalc/util/misc";
import { CourseActions } from "../actions";
import { CourseSettingsRecord, CourseStore } from "../store";
import ConfigurationCopying from "./configuration-copying";
import { CustomizeStudentProjectFunctionality } from "./customize-student-project-functionality";
import { DatastoreConfig } from "./datastore-config";
import { DisableStudentCollaboratorsPanel } from "./disable-collaborators";
import { EnvironmentVariablesConfig } from "./envvars-config";
import { Nbgrader } from "./nbgrader";
import { Parallel } from "./parallel";
import StudentPay from "./student-pay";
import { StudentProjectSoftwareEnvironment } from "./student-project-software-environment";
import { COLORS } from "@cocalc/util/theme";

interface Props {
  name: string;
  project_id: string;
  settings: CourseSettingsRecord;
}

export function ConfigurationPanel({
  name,
  project_id,
  settings,
}: Props) {
  const actions = useActions<CourseActions>({ name });

  return (
    <div
      className="smc-vfill"
      style={{
        overflowY: "scroll",
      }}
    >
      <Row>
        <Col md={12} style={{ padding: "15px 15px 15px 0" }}>
          <UpgradeConfiguration
            settings={settings}
            actions={actions}
          />
          <br />
          <TitleAndDescription
            actions={actions}
            settings={settings}
            name={name}
          />
          <br />
          <EmailInvitation
            actions={actions}
            redux={redux}
            project_id={project_id}
            name={name}
          />
          <br />
          <Nbgrader name={name} />
        </Col>
        <Col md={12} style={{ padding: "15px" }}>
          <CollaboratorPolicy settings={settings} actions={actions} />
          <br />
          <RestrictStudentProjects settings={settings} actions={actions} />
          <br />
          <ConfigureSoftwareEnvironment
            actions={actions}
            settings={settings}
            project_id={project_id}
          />
          <br />
          <Parallel name={name} />
          <NetworkFilesystem
            actions={actions}
            settings={settings}
            project_id={project_id}
          />
          <br />
          <EnvVariables
            actions={actions}
            settings={settings}
            project_id={project_id}
          />
          <br />
          <ConfigurationCopying
            actions={actions}
            settings={settings}
            project_id={project_id}
          />
        </Col>
      </Row>
    </div>
  );
}

export function UpgradeConfiguration({
  settings,
  actions,
}) {
  const is_commercial = useTypedRedux("customize", "is_commercial");

  return (
    <Card
      title={
        <>
          <Icon name="gears" />{" "}
          <FormattedMessage
            id="course.configuration.configure_upgrades.title"
            defaultMessage={"Configure Upgrades"}
          />
        </>
      }
    >
      {is_commercial && <StudentPay actions={actions} settings={settings} />}
    </Card>
  );
}

export function TitleAndDescription({ actions, settings, name }) {
  const intl = useIntl();
  if (settings == null) {
    return <Spin />;
  }
  return (
    <Card
      title={
        <>
          <Icon name="header" />{" "}
          {intl.formatMessage(course.title_and_description_label)}
        </>
      }
    >
      <LabeledRow label="Title">
        <TextInput
          text={settings.get("title") ?? ""}
          on_change={(title) => actions.configuration.set_title(title)}
        />
      </LabeledRow>
      <LabeledRow label="Description">
        <MarkdownInput
          persist_id={name + "course-description"}
          attach_to={name}
          rows={6}
          default_value={settings.get("description")}
          on_save={(desc) => actions.configuration.set_description(desc)}
        />
      </LabeledRow>
      <hr />
      <span style={{ color: COLORS.GRAY_M }}>
        <FormattedMessage
          id="course.configuration.title_and_description.info"
          defaultMessage={`Set the course title and description here.
          When you change the title or description,
          the corresponding title and description of each student project will be updated.
          The description is set to this description,
          and the title is set to the student name followed by this title.
          Use the description to provide additional information about the course,
          e.g., a link to the main course website.`}
        />
      </span>
    </Card>
  );
}

export function EmailInvitation({ actions, redux, project_id, name }) {
  const intl = useIntl();
  const [error, setError] = useState<string>("");
  const store = useStore<CourseStore>({ name });

  const check_email_body = debounce(
    (value) => {
      const allow_urls: boolean = redux
        .getStore("projects")
        .allow_urls_in_emails(project_id);
      if (!allow_urls && contains_url(value)) {
        setError(
          intl.formatMessage({
            id: "course.configuration.email_invitation.url_error",
            defaultMessage:
              "URLs in emails are not allowed for free trial projects.  Please upgrade or delete the URL. This is an anti-spam measure.",
          }),
        );
      } else {
        setError("");
      }
    },
    500,
    { leading: true, trailing: true },
  );

  return (
    <Card
      title={
        <>
          <Icon name="envelope" />{" "}
          {intl.formatMessage(course.email_invitation_label)}
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
        <ShowError error={error} />
        <MarkdownInput
          persist_id={name + "email-invite-body"}
          attach_to={name}
          rows={6}
          default_value={store.get_email_invite()}
          on_save={(body) => actions.configuration.set_email_invite(body)}
          save_disabled={!!error}
          on_change={check_email_body}
          on_cancel={() => setError("")}
        />
      </div>
      <hr />
      <span style={{ color: COLORS.GRAY_M }}>
        <FormattedMessage
          id="course.configuration.email_invitation.info"
          defaultMessage={`If you add a student to this course using their email address,
          and they do not have a CoCalc account, then they will receive this email invitation.
          Also, "{title}" will be replaced by the title of the course and "{name}" by your name.`}
          description={`Email invitations for students in an online course. Do not change {name} and {title} since they are variables.`}
          values={{
            // the curly brackets are replaced by the variable with brackets, since we also use this for template vars.
            title: "{title}",
            name: "{name}",
          }}
        />
      </span>
    </Card>
  );
}

export function CollaboratorPolicy({ settings, actions }) {
  return (
    <DisableStudentCollaboratorsPanel
      checked={!!settings.get("allow_collabs")}
      on_change={(val) => actions.configuration.set_allow_collabs(val)}
    />
  );
}

export function RestrictStudentProjects({ settings, actions }) {
  const functionality =
    settings.get("student_project_functionality")?.toJS() ?? {};
  return (
    <CustomizeStudentProjectFunctionality
      functionality={functionality}
      onChange={async (opts) =>
        await actions.configuration.set_student_project_functionality(opts)
      }
    />
  );
}

export function NetworkFilesystem({
  settings,
  actions,
  project_id,
  close,
}: {
  settings;
  actions;
  project_id;
  close?;
}) {
  return (
    <DatastoreConfig
      actions={actions.configuration}
      datastore={settings.get("datastore")}
      project_id={project_id}
      close={close}
    />
  );
}

export function EnvVariables({
  settings,
  actions,
  project_id,
  close,
}: {
  settings;
  actions;
  project_id;
  close?;
}) {
  return (
    <EnvironmentVariablesConfig
      actions={actions.configuration}
      envvars={settings.get("envvars")}
      project_id={project_id}
      close={close}
    />
  );
}

export function ConfigureSoftwareEnvironment({
  actions,
  settings,
  project_id,
  close,
}: {
  actions;
  settings;
  project_id;
  close?;
}) {
  return (
    <StudentProjectSoftwareEnvironment
      actions={actions.configuration}
      software_image={settings.get("custom_image")}
      course_project_id={project_id}
      inherit_compute_image={settings.get("inherit_compute_image")}
      close={close}
    />
  );
}
