/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Upgrading quotas for all student projects

import {
  Button,
  Card,
  Checkbox,
  Divider,
  Form,
  Popconfirm,
  Radio,
  Space,
  Switch,
  Typography,
} from "antd";
import { delay } from "awaiting";
import { useEffect, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import { alert_message } from "@cocalc/frontend/alerts";
import { CSS, redux, useActions } from "@cocalc/frontend/app-framework";
import { A, Icon, Paragraph } from "@cocalc/frontend/components";
import Next from "@cocalc/frontend/components/next";
import { labels } from "@cocalc/frontend/i18n";
import { SiteLicenseInput } from "@cocalc/frontend/site-licenses/input";
import { SiteLicensePublicInfoTable } from "@cocalc/frontend/site-licenses/site-license-public-info";
import { SiteLicenses } from "@cocalc/frontend/site-licenses/types";
import { ShowSupportLink } from "@cocalc/frontend/support";
import { COLORS } from "@cocalc/util/theme";
import { CourseActions } from "../actions";
import {
  CourseSettingsRecord,
  CourseStore,
  DEFAULT_LICENSE_UPGRADE_HOST_PROJECT,
} from "../store";
import { SiteLicenseStrategy } from "../types";
import { ConfigurationActions } from "./actions";

const radioStyle: CSS = {
  display: "block",
  whiteSpace: "normal",
  fontWeight: "inherit", // this is to undo what react-bootstrap does to the labels.
} as const;

interface Props {
  name: string;
  is_onprem: boolean;
  is_commercial: boolean;
  institute_pay?: boolean;
  student_pay?: boolean;
  site_license_id?: string;
  site_license_strategy?: SiteLicenseStrategy;
  shared_project_id?: string;
  disabled?: boolean;
  settings: CourseSettingsRecord;
  actions: ConfigurationActions;
}

export function StudentProjectUpgrades({
  name,
  is_onprem,
  is_commercial,
  institute_pay,
  student_pay,
  site_license_id,
  site_license_strategy,
  shared_project_id,
  disabled,
  settings,
  actions,
}: Props) {
  const intl = useIntl();

  const course_actions = useActions<CourseActions>({ name });
  const [show_site_license, set_show_site_license] = useState<boolean>(false);

  function get_store(): CourseStore {
    return redux.getStore(name) as any;
  }

  async function add_site_license_id(license_id: string) {
    course_actions.configuration.add_site_license_id(license_id);
    await delay(100);
    course_actions.configuration.configure_all_projects();
  }

  async function remove_site_license_id(license_id: string) {
    course_actions.configuration.remove_site_license_id(license_id);
    await delay(100);
    course_actions.configuration.configure_all_projects();
  }

  function render_site_license_text() {
    if (!show_site_license) return;
    return (
      <div>
        <br />
        <FormattedMessage
          id="course.upgrades.site_license_text.info"
          defaultMessage={`Enter a license key below to automatically apply upgrades from that
            license to this course project, all student projects, and the shared
            project whenever they are running. Clear the field below to stop
            applying those upgrades. Upgrades from the license are only applied when
            a project is started.`}
        />{" "}
        {is_commercial ? (
          <FormattedMessage
            id="course.upgrades.site_license_text.info-commercial"
            defaultMessage={`Create a {support} if you need to purchase a license key
            via a purchase order.`}
            values={{
              support: <ShowSupportLink />,
            }}
          />
        ) : undefined}
        <SiteLicenseInput
          onSave={(license_id) => {
            set_show_site_license(false);
            add_site_license_id(license_id);
          }}
          onCancel={() => {
            set_show_site_license(false);
          }}
        />
      </div>
    );
  }

  function render_licenses(site_licenses: SiteLicenses): React.JSX.Element {
    return (
      <SiteLicensePublicInfoTable
        site_licenses={site_licenses}
        onRemove={(license_id) => {
          remove_site_license_id(license_id);
        }}
        warn_if={(info, _) => {
          const upgradeHostProject = settings.get(
            "license_upgrade_host_project",
          );
          const n =
            get_store().get_student_ids().length +
            (upgradeHostProject ? 1 : 0) +
            (shared_project_id ? 1 : 0);
          if (info.run_limit < n) {
            return (
              <FormattedMessage
                id="course.upgrades.render_licenses.note"
                defaultMessage={`NOTE: This license can only upgrade {run_limit} simultaneous running projects,
                  but there are {n} projects associated to this course.`}
                values={{ n, run_limit: info.run_limit }}
              />
            );
          }
        }}
      />
    );
  }

  function render_site_license_strategy() {
    return (
      <Paragraph
        style={{
          margin: "0",
          border: `1px solid ${COLORS.GRAY_L}`,
          padding: "15px",
          borderRadius: "5px",
        }}
      >
        <FormattedMessage
          id="course.upgrades.license_strategy.explanation"
          defaultMessage={`<b>License strategy:</b>
            Since you have multiple licenses,
            there are two different ways they can be used,
            depending on whether you're trying to maximize the number of covered students
            or the upgrades per students:`}
        />
        <br />
        <Radio.Group
          disabled={disabled}
          style={{ marginLeft: "15px", marginTop: "15px" }}
          onChange={(e) => {
            course_actions.configuration.set_site_license_strategy(
              e.target.value,
            );
            course_actions.configuration.configure_all_projects(true);
          }}
          value={site_license_strategy ?? "serial"}
        >
          <Radio value={"serial"} key={"serial"} style={radioStyle}>
            <FormattedMessage
              id="course.upgrades.license_strategy.radio.coverage"
              defaultMessage={`<b>Maximize number of covered students:</b>
                apply one license to each project associated to this course
                (e.g., you bought a license to handle a few more students who were added your course).
                If you have more students than license seats,
                the first students to start their projects will get the upgrades.`}
            />
          </Radio>
          <Radio value={"parallel"} key={"parallel"} style={radioStyle}>
            <FormattedMessage
              id="course.upgrades.license_strategy.radio.upgrades"
              defaultMessage={`  <b>Maximize upgrades to each project:</b>
                apply all licenses to all projects associated to this course
                (e.g., you bought a license to increase the RAM or CPU for all students).`}
            />
          </Radio>
        </Radio.Group>
        <Divider type="horizontal" />
        <FormattedMessage
          id="course.upgrades.license_strategy.redistribute"
          defaultMessage={`<Button>Redistribute licenses</Button> – e.g. useful if a license expired`}
          values={{
            Button: (c) => (
              <Button
                onClick={() =>
                  course_actions.configuration.configure_all_projects(true)
                }
                size="small"
              >
                <Icon name="arrows" /> {c}
              </Button>
            ),
          }}
        />
      </Paragraph>
    );
  }

  function render_current_licenses() {
    if (!site_license_id) return;
    const licenses = site_license_id.split(",");

    const site_licenses: SiteLicenses = licenses.reduce((acc, v) => {
      acc[v] = null; // we have no info about them yet
      return acc;
    }, {});

    return (
      <div style={{ margin: "15px 0" }}>
        <FormattedMessage
          id="course.upgades.current_licenses.info"
          defaultMessage={`This project and all student projects will be upgraded using the
          following
          <b>{n} {n, select, 1 {license} other {licenses}}</b>,
          unless it is expired or in use by too many projects:`}
          values={{ n: licenses.length }}
        />
        <br />
        <div style={{ margin: "15px 0", padding: "0" }}>
          {render_licenses(site_licenses)}
        </div>
        {licenses.length > 1 && render_site_license_strategy()}
      </div>
    );
  }

  function render_remove_all_licenses() {
    return (
      <Popconfirm
        title={intl.formatMessage({
          id: "course.upgrades.remove_all_licenses.title",
          defaultMessage: "Remove all licenses from all student projects?",
        })}
        onConfirm={async () => {
          try {
            await course_actions.student_projects.remove_all_project_licenses();
            alert_message({
              type: "info",
              message: intl.formatMessage({
                id: "course.upgrades.remove_all_licenses.success",
                defaultMessage:
                  "Successfully removed all licenses from student projects.",
              }),
            });
          } catch (err) {
            alert_message({ type: "error", message: `${err}` });
          }
        }}
      >
        <Button style={{ marginTop: "15px" }}>
          <FormattedMessage
            id="course.upgrades.remove_all_licenses"
            defaultMessage={"Remove licenses from student projects..."}
          />
        </Button>
      </Popconfirm>
    );
  }

  function render_site_license() {
    const n = !!site_license_id ? site_license_id.split(",").length : 0;
    return (
      <div>
        {render_current_licenses()}
        <div>
          <Button
            onClick={() => set_show_site_license(true)}
            disabled={show_site_license}
          >
            <Icon name="key" />{" "}
            <FormattedMessage
              id="course.upgades.site_license.upgrade-button.label"
              defaultMessage={`{n, select,
              0 {Upgrade using a license key}
              other {Add another license key (more students or better upgrades)}}`}
              values={{ n }}
            />
            ...
          </Button>
          {render_site_license_text()}
        </div>
        <Space>
          {is_commercial && (
            <div style={{ marginTop: "15px" }}>
              <Next
                href={"store/site-license"}
                query={{
                  user: "academic",
                  period: "range",
                  run_limit: (get_store()?.num_students() ?? 0) + 2,
                  title: settings.get("title") ?? "",
                  description: settings.get("description") ?? "",
                }}
              >
                <Button>
                  <FormattedMessage
                    id="course.upgrades.site_license.buy-button.label"
                    defaultMessage={"Buy a license..."}
                  />
                </Button>
              </Next>
            </div>
          )}
          {n == 0 && render_remove_all_licenses()}
        </Space>
        <div>
          <ToggleUpgradingHostProject actions={actions} settings={settings} />
        </div>
      </div>
    );
  }

  function handle_institute_pay_checkbox(e): void {
    course_actions.configuration.set_pay_choice("institute", e.target.checked);
  }

  function render_checkbox() {
    return (
      <Checkbox
        checked={!!institute_pay}
        onChange={handle_institute_pay_checkbox}
      >
        <FormattedMessage
          id="course.upgrades.checkbox-institute-pays"
          defaultMessage={"You or your institute will pay for this course"}
        />
      </Checkbox>
    );
  }

  function render_details() {
    return (
      <div style={{ marginTop: "15px" }}>
        {render_site_license()}
        <hr />
        <div style={{ color: COLORS.GRAY_M }}>
          <p>
            <FormattedMessage
              id="course.upgrades.details"
              defaultMessage={`Add or remove upgrades to student projects associated to this course,
                adding to what is provided for free and what students may have purchased.
                <A>Help...</A>`}
              values={{
                A: (c) => (
                  <A href="https://doc.cocalc.com/teaching-create-course.html#option-2-teacher-or-institution-pays-for-upgradespay">
                    {c}
                  </A>
                ),
              }}
              description={"Students in an university online course."}
            />
          </p>
        </div>
      </div>
    );
  }

  function render_onprem(): React.JSX.Element {
    return <div>{render_site_license()}</div>;
  }

  function render_title() {
    if (is_onprem) {
      return (
        <div>
          <FormattedMessage
            id="course.upgrades.onprem.title"
            defaultMessage={"Upgrade Student Projects"}
          />
        </div>
      );
    } else {
      return (
        <div>
          <Icon name="dashboard" />{" "}
          <FormattedMessage
            id="course.upgrades.prod.title"
            defaultMessage={"Upgrade all Student Projects (Institute Pays)"}
          />
        </div>
      );
    }
  }

  function render_body(): React.JSX.Element {
    if (is_onprem) {
      return render_onprem();
    } else {
      return (
        <>
          {render_checkbox()}
          {institute_pay ? render_details() : undefined}
        </>
      );
    }
  }

  return (
    <Card
      style={{
        marginTop: "20px",
        background:
          is_onprem || student_pay || institute_pay ? undefined : "#fcf8e3",
      }}
      title={render_title()}
    >
      {render_body()}
    </Card>
  );
}

interface ToggleUpgradingHostProjectProps {
  actions: ConfigurationActions;
  settings: CourseSettingsRecord;
}

const ToggleUpgradingHostProject = ({
  actions,
  settings,
}: ToggleUpgradingHostProjectProps) => {
  const intl = useIntl();
  const [needSave, setNeedSave] = useState<boolean>(false);
  const upgradeHostProject = settings.get("license_upgrade_host_project");
  const upgrade = upgradeHostProject ?? DEFAULT_LICENSE_UPGRADE_HOST_PROJECT;
  const [nextVal, setNextVal] = useState<boolean>(upgrade);

  useEffect(() => {
    setNeedSave(nextVal != upgrade);
  }, [nextVal, upgrade]);

  const label = intl.formatMessage({
    id: "course.upgrades.toggle-host.label",
    defaultMessage: "Upgrade instructor project:",
  });

  function toggle() {
    return (
      <Form layout="inline">
        <Form.Item label={label} style={{ marginBottom: 0 }}>
          <Switch checked={nextVal} onChange={(val) => setNextVal(val)} />
        </Form.Item>
        <Form.Item>
          <Button
            disabled={!needSave}
            type={needSave ? "primary" : undefined}
            onClick={() => actions.set_license_upgrade_host_project(nextVal)}
          >
            {intl.formatMessage(labels.save)}
          </Button>
        </Form.Item>
      </Form>
    );
  }

  return (
    <>
      <hr />
      {toggle()}
      <Typography.Paragraph
        ellipsis={{ expandable: true, rows: 1, symbol: "more" }}
      >
        {intl.formatMessage({
          id: "course.upgrades.toggle-host.info",
          defaultMessage: `If enabled, this instructor project is upgraded using all configured course license(s).
            Otherwise, explictly add your license to the instructor project.
            Disabling this options does <i>not</i> remove licenses from the instructor project.`,
        })}
      </Typography.Paragraph>
    </>
  );
};
