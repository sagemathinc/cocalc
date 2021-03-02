/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Upgrading quotas for all student projects

import { SiteLicenseStrategy, UpgradeGoal } from "../types";
import {
  is_zero_map,
  len,
  map_sum,
  parse_number_input,
  plural,
  round2,
} from "smc-util/misc";
import { PROJECT_UPGRADES } from "smc-util/schema";
import {
  CSS,
  React,
  redux,
  Rendered,
  TypedMap,
  useIsMountedRef,
  useRef,
  useState,
  useTypedRedux,
} from "../../app-framework";
import { CourseActions } from "../actions";
import { CourseStore } from "../store";
import { SiteLicensePublicInfo } from "../../site-licenses/site-license-public-info";
import { SiteLicenseInput } from "../../site-licenses/input";
import { PurchaseOneLicenseLink } from "../../site-licenses/purchase";
import { ShowSupportLink } from "../../support";
import {
  A,
  Icon,
  Loading,
  NoUpgrades,
  Tip,
  UPGRADE_ERROR_STYLE,
} from "../../r_misc";
import { UpgradeRestartWarning } from "../../upgrade-restart-warning";
import {
  Button,
  ButtonGroup,
  Checkbox,
  FormGroup,
  FormControl,
  Row,
  Col,
} from "../../antd-bootstrap";
import { Alert, Card, Radio } from "antd";
import { alert_message } from "../../alerts";

const radioStyle: CSS = {
  display: "block",
  whiteSpace: "normal",
  fontWeight: "inherit", // this is to undo what react-bootstrap does to the labels.
} as const;

interface Props {
  name: string;
  upgrade_goal?: TypedMap<UpgradeGoal>;
  institute_pay?: boolean;
  student_pay?: boolean;
  site_license_id?: string;
  site_license_strategy?: SiteLicenseStrategy;
  shared_project_id?: string;
  disabled?: boolean;
}

export const StudentProjectUpgrades: React.FC<Props> = (props) => {
  const is_mounted_ref = useIsMountedRef();
  const upgrade_is_invalid = useRef<boolean>(false);

  const [upgrade_quotas, set_upgrade_quotas] = useState<boolean>(false); // true if display the quota upgrade panel
  const [upgrades, set_upgrades] = useState<object>({});
  const [upgrade_plan, set_upgrade_plan] = useState<object | undefined>(
    undefined
  );
  const [loading_all_projects, set_loading_all_projects] = useState<boolean>(
    false
  );
  const [show_site_license, set_show_site_license] = useState<boolean>(false);

  const all_projects_have_been_loaded = useTypedRedux(
    "projects",
    "all_projects_have_been_loaded"
  );

  function get_actions(): CourseActions {
    return redux.getActions(props.name);
  }

  function get_store(): CourseStore {
    return redux.getStore(props.name) as any;
  }

  function upgrade_goal(): UpgradeGoal {
    const goal = {};
    for (const quota in upgrades) {
      let val = upgrades[quota];
      val = parse_number_input(val, false);
      const { display_factor } = PROJECT_UPGRADES.params[quota];
      goal[quota] = val / display_factor;
    }
    return goal;
  }

  function save_upgrade_quotas(): void {
    set_upgrade_quotas(false);
    const a = get_actions();
    const goal = upgrade_goal();
    a.configuration.set_upgrade_goal(goal);
    a.student_projects.upgrade_all_student_projects(goal);
  }

  function render_upgrade_heading(num_projects) {
    return (
      <Row key="heading">
        <Col md={5}>
          <b style={{ fontSize: "11pt" }}>Quota</b>
        </Col>
        <Col md={7}>
          <b style={{ fontSize: "11pt" }}>
            Distribute upgrades to your {num_projects} student{" "}
            {plural(num_projects, "project")} to get quota to the amount in this
            column (amounts may be decimals)
          </b>
        </Col>
      </Row>
    );
  }

  function is_upgrade_input_valid(val, limit): boolean {
    const parsed_val = parse_number_input(val, false);
    if (parsed_val == null || parsed_val > Math.max(0, limit)) {
      // val=0 is always valid
      return false;
    } else {
      return true;
    }
  }

  function render_upgrade_row_input(
    quota,
    input_type,
    yours,
    num_projects,
    limit
  ) {
    let label, val;
    if (input_type === "number") {
      let style;
      val = upgrades[quota] ?? yours / num_projects;
      if (upgrades[quota] == null) {
        if (val === 0 && yours !== 0) {
          val = yours / num_projects;
        }
      }

      if (!is_upgrade_input_valid(val, limit)) {
        style = UPGRADE_ERROR_STYLE;
        upgrade_is_invalid.current = true;
        if (parse_number_input(val) != null) {
          label = (
            <div style={UPGRADE_ERROR_STYLE}>
              Reduce the above: you do not have enough upgrades
            </div>
          );
        } else {
          label = <div style={UPGRADE_ERROR_STYLE}>Please enter a number</div>;
        }
      } else {
        label = <span />;
      }
      return (
        <FormGroup>
          <FormControl
            type="text"
            style={style}
            value={val}
            onChange={(e) => {
              const u = upgrades;
              const value = (e.target as any).value;
              if (value == null) return;
              u[quota] = value;
              set_upgrades(u);
              update_plan();
            }}
          />
          {label}
        </FormGroup>
      );
    } else if (input_type === "checkbox") {
      val = upgrades[quota] != null ? upgrades[quota] : yours > 0 ? 1 : 0;
      const is_valid = is_upgrade_input_valid(val, limit);
      if (!is_valid) {
        upgrade_is_invalid.current = true;
        label = (
          <div style={UPGRADE_ERROR_STYLE}>
            Uncheck this: you do not have enough upgrades
          </div>
        );
      } else {
        label = val === 0 ? "Disabled" : "Enabled";
      }
      return (
        <Checkbox
          checked={val > 0}
          onChange={(e) => {
            const u = upgrades;
            u[quota] = (e.target as any).checked ? 1 : 0;
            set_upgrades(u);
            update_plan();
          }}
        >
          {label}
        </Checkbox>
      );
    } else {
      console.warn(
        "Invalid input type in render_upgrade_row_input: ",
        input_type
      );
      return;
    }
  }

  function render_upgrade_row(quota, available, current, yours, num_projects) {
    // quota -- name of the quota
    // available -- How much of this quota the user has available to use on the student projects.
    //              This is the total amount the user purchased minus the amount allocated to other
    //              projects that aren't projects in this course.
    // current   -- Sum of total upgrades currently allocated by anybody to the course projects
    // yours     -- How much of this quota this user has allocated to this quota total.
    // num_projects -- How many student projects there are.
    const {
      display,
      desc,
      display_factor,
      display_unit,
      input_type,
    } = PROJECT_UPGRADES.params[quota];

    yours *= display_factor;
    current *= display_factor;

    const x = upgrades[quota];
    let input: number;
    if (x == "") {
      input = 0;
    } else {
      const n = parse_number_input(x);
      if (n == null) {
        input = 0;
      } else {
        input = yours / num_projects; // currently typed in
      }
    }
    if (input_type === "checkbox") {
      input = input > 0 ? 1 : 0;
    }

    const remaining = round2(
      (available - (input / display_factor) * num_projects) * display_factor
    );
    const limit = (available / num_projects) * display_factor;

    let cur: number | string = round2(current / num_projects);
    if (input_type === "checkbox") {
      if (cur > 0 && cur < 1) {
        cur = `${round2(cur * 100)}%`;
      } else if (cur === 0) {
        cur = "none";
      } else {
        cur = "all";
      }
    }

    return (
      <Row key={quota}>
        <Col md={5}>
          <Tip title={display} tip={desc}>
            <strong>{display}</strong>
          </Tip>
          <span style={{ marginLeft: "1ex" }}>
            ({remaining} {plural(remaining, display_unit)} remaining)
          </span>
        </Col>
        <Col md={5}>
          {render_upgrade_row_input(
            quota,
            input_type,
            yours,
            num_projects,
            limit
          )}
        </Col>
        <Col md={2} style={{ marginTop: "8px" }}>
          &times; {num_projects}
        </Col>
      </Row>
    );
  }

  function render_upgrade_rows(
    purchased_upgrades,
    applied_upgrades,
    num_projects,
    total_upgrades,
    your_upgrades
  ) {
    // purchased_upgrades - how much of each quota this user has purchased
    // applied_upgrades   - how much of each quota user has already applied to projects total
    // num_projects       - number of student projects
    // total_upgrades     - the total amount of each quota that has been applied (by anybody) to these student projects
    // your_upgrades      - total amount of each quota that this user has applied to these student projects
    upgrade_is_invalid.current = false; // will get set to true by render_upgrade_row if invalid.
    const result: any[] = [];
    for (const quota of PROJECT_UPGRADES.field_order) {
      const total = purchased_upgrades[quota];
      const yours = your_upgrades[quota] ?? 0;
      const available = total - (applied_upgrades[quota] ?? 0) + yours;
      const current = total_upgrades[quota] ?? 0;
      result.push(
        render_upgrade_row(quota, available, current, yours, num_projects)
      );
    }
    return result;
  }

  function render_upgrade_quotas() {
    // Get available upgrades that instructor has to apply
    const account_store = redux.getStore("account");
    if (account_store == null) {
      return <Loading />;
    }

    const purchased_upgrades = account_store.get_total_upgrades();
    if (is_zero_map(purchased_upgrades)) {
      // user has no upgrades on their account
      return <NoUpgrades cancel={() => set_upgrade_quotas(false)} />;
    }

    const course_store = get_store();
    if (course_store == null) {
      return <Loading />;
    }

    // Get non-deleted student projects
    const project_ids: string[] = course_store.get_student_project_ids();
    const num_projects = project_ids.length;
    if (!num_projects) {
      return (
        <span>
          There are no student projects yet.
          <br />
          <br />
          {render_upgrade_submit_buttons()}
        </span>
      );
    }

    // Get remaining upgrades
    const projects_store = redux.getStore("projects");
    if (projects_store == null) {
      return <Loading />;
    }
    const applied_upgrades = projects_store.get_total_upgrades_you_have_applied();

    // Sum total amount of each quota that we have applied to all student projects
    let total_upgrades = {}; // all upgrades by anybody
    let your_upgrades = {}; // just by you
    for (const project_id of project_ids) {
      your_upgrades = map_sum(
        your_upgrades,
        projects_store.get_upgrades_you_applied_to_project(project_id) as any
      );
      total_upgrades = map_sum(
        total_upgrades,
        projects_store.get_total_project_upgrades(project_id) as any
      );
    }

    return (
      <Alert
        type="warning"
        message={
          <div>
            <h3>
              <Icon name="arrow-circle-up" /> Adjust your contributions to the
              student project upgrades
            </h3>
            <hr />
            {render_upgrade_heading(num_projects)}
            <hr />
            {render_upgrade_rows(
              purchased_upgrades,
              applied_upgrades,
              num_projects,
              total_upgrades,
              your_upgrades
            )}
            <UpgradeRestartWarning />
            <br />
            {render_upgrade_submit_buttons()}
            <div style={{ marginTop: "15px", color: "#333" }}>
              {render_upgrade_plan()}
            </div>
          </div>
        }
      />
    );
  }

  function render_upgrade_submit_buttons() {
    return (
      <ButtonGroup>
        <Button
          bsStyle="primary"
          onClick={save_upgrade_quotas}
          disabled={upgrade_plan == null || len(upgrade_plan) === 0}
        >
          <Icon name="arrow-circle-up" /> Apply changes
        </Button>
        <Button onClick={() => set_upgrade_quotas(false)}>Cancel</Button>
      </ButtonGroup>
    );
  }

  // call this function to switch state from not viewing the upgrader to viewing the upgrader.
  async function adjust_quotas(): Promise<void> {
    if (!all_projects_have_been_loaded) {
      // See https://github.com/sagemathinc/cocalc/issues/3802
      const a = redux.getActions("projects");
      if (a != null) {
        set_loading_all_projects(true);
        await a.load_all_projects();
        if (!is_mounted_ref.current) return;
        set_loading_all_projects(false);
      }
    }
    let left;
    const upgrades =
      (left =
        props.upgrade_goal != null ? props.upgrade_goal.toJS() : undefined) !=
      null
        ? left
        : {};
    const upgrade_plan = get_store().get_upgrade_plan(upgrades);
    for (const quota in upgrades) {
      const val = upgrades[quota];
      upgrades[quota] = val * PROJECT_UPGRADES.params[quota].display_factor;
    }
    set_upgrade_quotas(true);
    set_upgrades(upgrades);
    set_upgrade_plan(upgrade_plan);
  }

  function update_plan(): void {
    set_upgrade_plan(get_store().get_upgrade_plan(upgrade_goal()));
  }

  function render_upgrade_plan() {
    if (upgrade_plan == null) {
      return;
    }
    const n = len(upgrade_plan);
    if (n === 0) {
      return (
        <span>
          The upgrades requested above are already applied to all student
          projects.
        </span>
      );
    } else {
      return (
        <span>
          {n} of the student projects will have their upgrades changed when you
          click the Apply button.
        </span>
      );
    }
  }

  function render_upgrade_quotas_button() {
    if (loading_all_projects) {
      return (
        <Button disabled={true}>
          <Icon name="arrow-circle-up" /> Upgrade using a course package or
          subscription... (Loading)
        </Button>
      );
    }
    return (
      <Button onClick={adjust_quotas}>
        <Icon name="arrow-circle-up" /> Upgrade using a course package or
        subscription...
      </Button>
    );
  }

  function add_site_license_id(license_id: string): void {
    const actions = get_actions();
    actions.configuration.add_site_license_id(license_id);
    actions.configuration.configure_all_projects();
  }

  function remove_site_license_id(license_id: string): void {
    const actions = get_actions();
    actions.configuration.remove_site_license_id(license_id);
    actions.configuration.configure_all_projects();
  }

  function render_site_license_text(): Rendered {
    if (!show_site_license) return;
    return (
      <div>
        <br />
        Enter a license key below to automatically apply upgrades from that
        license to this course project, all student projects, and the shared
        project whenever they are running. Clear the field below to stop
        applying those upgrades. Upgrades from the license are only applied when
        a project is started. Create a <ShowSupportLink /> if you would like to
        purchase a license key.
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

  function render_license(license_id: string): JSX.Element {
    return (
      <SiteLicensePublicInfo
        key={license_id}
        license_id={license_id}
        onRemove={() => {
          remove_site_license_id(license_id);
        }}
        warn_if={(info) => {
          const n =
            get_store().get_student_ids().length +
            1 +
            (props.shared_project_id ? 1 : 0);
          if (info.run_limit < n) {
            return `NOTE: This license can only upgrade ${info.run_limit} simultaneous running projects, but there are ${n} projects associated to this course.`;
          }
        }}
      />
    );
  }

  function render_site_license_strategy() {
    return (
      <div
        style={{
          margin: "15px",
          border: "1px solid lightgrey",
          padding: "15px",
        }}
      >
        <b>License strategy:</b> Since you have multiple licenses, there are two
        different ways they can be used, depending on whether you're trying to
        maximize the number of covered students or the upgrades per students:
        <br />
        <Radio.Group
          disabled={props.disabled}
          style={{ marginLeft: "15px", marginTop: "15px" }}
          onChange={(e) => {
            const actions = get_actions();
            actions.configuration.set_site_license_strategy(e.target.value);
            actions.configuration.configure_all_projects(true);
          }}
          value={props.site_license_strategy ?? "serial"}
        >
          <Radio value={"serial"} key={"serial"} style={radioStyle}>
            <b>Maximize number of covered students:</b> apply one license to
            each project associated to this course (e.g., you bought a license
            to handle a few more students who added your course)
          </Radio>
          <Radio value={"parallel"} key={"parallel"} style={radioStyle}>
            <b>Maximize upgrades to each project:</b> apply all licenses to all
            projects associated to this course (e.g., you bought a license to
            increase the RAM or CPU for all students)
          </Radio>
        </Radio.Group>
      </div>
    );
  }

  function render_current_licenses(): Rendered {
    if (!props.site_license_id) return;
    const licenses = props.site_license_id.split(",");
    const v: JSX.Element[] = [];
    for (const license_id of licenses) {
      v.push(render_license(license_id));
    }
    return (
      <div style={{ margin: "15px 0" }}>
        This project and all student projects will be upgraded using the
        following{" "}
        <b>
          {licenses.length} license{licenses.length > 1 ? "s" : ""}
        </b>
        :
        <br />
        <div
          style={{
            margin: "15px",
            border: "1px solid lightgrey",
            padding: "15px",
            overflowY: "auto",
            maxHeight: "50vH",
          }}
        >
          {v}
        </div>
        {licenses.length > 1 && render_site_license_strategy()}
      </div>
    );
  }

  function render_remove_all_licenses() {
    return (
      <Button
        onClick={async () => {
          try {
            await get_actions().student_projects.remove_all_project_licenses();
            alert_message({
              type: "info",
              message:
                "Successfully removed all licenses from student projects.",
            });
          } catch (err) {
            alert_message({ type: "error", message: `${err}` });
          }
        }}
      >
        Remove all licenses from student projects
      </Button>
    );
  }

  function render_site_license() {
    const n = !!props.site_license_id
      ? props.site_license_id.split(",").length
      : 0;
    return (
      <div>
        {render_current_licenses()}
        <Button
          onClick={() => set_show_site_license(true)}
          disabled={show_site_license}
        >
          <Icon name="key" />{" "}
          {n == 0
            ? "Upgrade using a license key"
            : "Add another license key (more students or better upgrades)"}
          ...
        </Button>
        {render_site_license_text()}
        <br />
        <br />
        <div style={{ fontSize: "13pt" }}>
          <PurchaseOneLicenseLink />
        </div>
        <br />
        {n == 0 && render_remove_all_licenses()}
      </div>
    );
  }

  function handle_institute_pay_checkbox(e): void {
    return get_actions().configuration.set_pay_choice(
      "institute",
      e.target.checked
    );
  }

  function render_checkbox() {
    return (
      <span>
        <Checkbox
          checked={!!props.institute_pay}
          onChange={handle_institute_pay_checkbox}
        >
          You or your institute will pay for this course
        </Checkbox>
      </span>
    );
  }

  function render_details() {
    return (
      <div>
        {render_site_license()}
        <hr />
        {upgrade_quotas
          ? render_upgrade_quotas()
          : render_upgrade_quotas_button()}
        <hr />
        <div style={{ color: "#666" }}>
          <p>
            Add or remove upgrades to student projects associated to this
            course, adding to what is provided for free and what students may
            have purchased.{" "}
            <A href="https://doc.cocalc.com/teaching-create-course.html#option-2-teacher-or-institution-pays-for-upgradespay">
              Help...
            </A>
          </p>
        </div>
      </div>
    );
  }

  let bg, style;
  if (props.student_pay || props.institute_pay) {
    style = bg = undefined;
  } else {
    style = { fontWeight: "bold" };
    bg = "#fcf8e3";
  }
  return (
    <Card
      style={{ background: bg }}
      title={
        <div style={style}>
          <Icon name="dashboard" /> Upgrade all student projects (institute
          pays)
        </div>
      }
    >
      {render_checkbox()}
      {props.institute_pay ? render_details() : undefined}
    </Card>
  );
};
