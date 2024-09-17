/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { debounce } from "lodash";
import { Card, Row, Col } from "antd";
import {
  React,
  redux,
  useActions,
  useState,
  useStore,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { contains_url } from "@cocalc/util/misc";
import {
  Icon,
  LabeledRow,
  Loading,
  MarkdownInput,
  TextInput,
  ErrorDisplay,
} from "@cocalc/frontend/components";
import { StudentProjectUpgrades } from "./upgrades";
import { CourseActions } from "../actions";
import { CourseSettingsRecord, CourseStore } from "../store";
import { Nbgrader } from "./nbgrader";
import { Parallel } from "./parallel";
import { DisableStudentCollaboratorsPanel } from "./disable-collaborators";
import { CustomizeStudentProjectFunctionality } from "./customize-student-project-functionality";
import { StudentProjectSoftwareEnvironment } from "./student-project-software-environment";
import { DatastoreConfig } from "./datastore-config";
import { KUCALC_ON_PREMISES } from "@cocalc/util/db-schema/site-defaults";
import { EnvironmentVariablesConfig } from "./envvars-config";
import StudentPay from "./student-pay";
//import Mirror from "./mirror";

interface Props {
  name: string;
  project_id: string;
  settings: CourseSettingsRecord;
  configuring_projects?: boolean;
}

export const ConfigurationPanel: React.FC<Props> = React.memo(
  ({ name, project_id, settings, configuring_projects }) => {
    const [email_body_error, set_email_body_error] = useState<
      string | undefined
    >(undefined);

    const actions = useActions<CourseActions>({ name });
    const store = useStore<CourseStore>({ name });
    const is_commercial = useTypedRedux("customize", "is_commercial");
    const kucalc = useTypedRedux("customize", "kucalc");

    /*
     * Editing title/description
     */
    function render_title_desc_header() {
      return (
        <>
          <Icon name="header" /> Title and Description
        </>
      );
    }

    function render_title_description() {
      if (settings == null) {
        return <Loading />;
      }
      return (
        <Card title={render_title_desc_header()}>
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
          <span style={{ color: "#666" }}>
            Set the course title and description here. When you change the title
            or description, the corresponding title and description of each
            student project will be updated. The description is set to this
            description, and the title is set to the student name followed by
            this title. Use the description to provide additional information
            about the course, e.g., a link to the main course website.
          </span>
        </Card>
      );
    }

    /*
     * Custom invitation email body
     */

    const check_email_body = debounce(
      (value) => {
        const allow_urls: boolean = redux
          .getStore("projects")
          .allow_urls_in_emails(project_id);
        if (!allow_urls && contains_url(value)) {
          set_email_body_error(
            "URLs in emails are not allowed for free trial projects.  Please upgrade or delete the URL. This is an anti-spam measure.",
          );
        } else {
          set_email_body_error(undefined);
        }
      },
      500,
      { leading: true, trailing: true },
    );

    function render_email_body_error() {
      if (email_body_error == null) return;
      return <ErrorDisplay error={email_body_error} />;
    }

    function render_email_invite_body() {
      const template_instr =
        " Also, {title} will be replaced by the title of the course and {name} by your name.";
      return (
        <Card
          title={
            <>
              <Icon name="envelope" /> Email Invitation
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
            {render_email_body_error()}
            <MarkdownInput
              persist_id={name + "email-invite-body"}
              attach_to={name}
              rows={6}
              default_value={store.get_email_invite()}
              on_save={(body) => actions.configuration.set_email_invite(body)}
              save_disabled={email_body_error != null}
              on_change={check_email_body}
              on_cancel={() => set_email_body_error(undefined)}
            />
          </div>
          <hr />
          <span style={{ color: "#666" }}>
            If you add a student to this course using their email address, and
            they do not have a CoCalc account, then they will receive this email
            invitation. {template_instr}
          </span>
        </Card>
      );
    }

    function render_require_institute_pay() {
      if (!is_commercial) return;
      return (
        <>
          <StudentProjectUpgrades
            name={name}
            is_onprem={false}
            is_commercial={is_commercial}
            upgrade_goal={settings?.get("upgrade_goal")}
            institute_pay={settings?.get("institute_pay")}
            student_pay={settings?.get("student_pay")}
            site_license_id={settings?.get("site_license_id")}
            site_license_strategy={settings?.get("site_license_strategy")}
            shared_project_id={settings?.get("shared_project_id")}
            disabled={configuring_projects}
            settings={settings}
            actions={actions.configuration}
          />
          <br />
        </>
      );
    }

    /**
     * OnPrem instances support licenses to be distributed to all student projects.
     */
    function render_onprem_upgrade_projects(): React.ReactNode {
      if (is_commercial || kucalc !== KUCALC_ON_PREMISES) return;
      return (
        <>
          <StudentProjectUpgrades
            name={name}
            is_onprem={true}
            is_commercial={false}
            site_license_id={settings?.get("site_license_id")}
            site_license_strategy={settings?.get("site_license_strategy")}
            shared_project_id={settings?.get("shared_project_id")}
            disabled={configuring_projects}
            settings={settings}
            actions={actions.configuration}
          />
          <br />
        </>
      );
    }

    function render_disable_students() {
      return (
        <DisableStudentCollaboratorsPanel
          checked={!!settings.get("allow_collabs")}
          on_change={(val) => actions.configuration.set_allow_collabs(val)}
        />
      );
    }

    function render_student_project_functionality() {
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

    function render_nbgrader() {
      return <Nbgrader name={name} />;
    }

    return (
      <div className="smc-vfill" style={{ overflowY: "scroll" }}>
        <Row>
          <Col md={12} style={{ padding: "15px 15px 15px 0" }}>
            {is_commercial && (
              <StudentPay actions={actions} settings={settings} />
            )}
            {render_require_institute_pay()}
            {render_onprem_upgrade_projects()}
            <br />
            {render_title_description()}
            <br />
            {render_email_invite_body()}
            <br />
            {render_nbgrader()}
          </Col>
          <Col md={12} style={{ padding: "15px" }}>
            {render_disable_students()}
            <br />
            {render_student_project_functionality()}
            <br />
            <StudentProjectSoftwareEnvironment
              actions={actions.configuration}
              software_image={settings.get("custom_image")}
              course_project_id={project_id}
              inherit_compute_image={settings.get("inherit_compute_image")}
            />
            <br />
            <Parallel name={name} />
            <DatastoreConfig
              actions={actions.configuration}
              datastore={settings.get("datastore")}
            />
            <br />
            <EnvironmentVariablesConfig
              actions={actions.configuration}
              envvars={settings.get("envvars")}
            />
            {/*<br />
            <Mirror
              checked={!!settings.get("mirror_config")}
              setChecked={(mirror_config: boolean) => {
                actions.set({ mirror_config, table: "settings" });
              }}
              path={settings.get("mirror_config_path")}
              setPath={(mirror_config_path) => {
                actions.set({ mirror_config_path, table: "settings" });
              }}
              project_id={project_id}
            />*/}
          </Col>
        </Row>
      </div>
    );
  },
);
