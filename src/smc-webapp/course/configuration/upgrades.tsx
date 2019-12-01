//#############################################################################
//
//    CoCalc: Collaborative Calculation in the Cloud
//
//    Copyright (C) 2016 -- 2017, Sagemath Inc.
//
//    This program is free software: you can redistribute it and/or modify
//    it under the terms of the GNU General Public License as published by
//    the Free Software Foundation, either version 3 of the License, or
//    (at your option) any later version.
//
//    This program is distributed in the hope that it will be useful,
//    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//    GNU General Public License for more details.
//
//    You should have received a copy of the GNU General Public License
//    along with this program.  If not, see <http://www.gnu.org/licenses/>.
//
//#############################################################################
// Upgrading quotas for all student projects
//#############################################################################

import { UpgradeGoal } from "../types";
import * as misc from "smc-util/misc";

import * as schema from "smc-util/schema";

import {
  Component,
  React,
  ReactDOM,
  AppRedux,
  rtypes,
  redux,
  rclass,
  Rendered,
  TypedMap
} from "../../app-framework";
import { CourseActions } from "../actions";
import { CourseStore } from "../store";

import {
  A,
  Icon,
  Loading,
  NoUpgrades,
  Tip,
  UPGRADE_ERROR_STYLE
} from "../../r_misc";

import { UpgradeRestartWarning } from "../../upgrade-restart-warning";

import {
  Alert,
  Button,
  ButtonToolbar,
  Checkbox,
  FormGroup,
  FormControl,
  Row,
  Col
} from "react-bootstrap";

import { Card } from "cocalc-ui";

interface StudentProjectUpgradesProps {
  name: string;
  redux: AppRedux;
  upgrade_goal?: TypedMap<UpgradeGoal>;
  institute_pay?: boolean;
  student_pay?: boolean;

  // redux props
  all_projects_have_been_loaded?: boolean;
}

interface StudentProjectUpgradesState {
  upgrade_quotas: boolean; // true if display the quota upgrade panel
  upgrades: object;
  upgrade_plan?: object;
  loading_all_projects?: boolean;
}

class StudentProjectUpgrades extends Component<
  StudentProjectUpgradesProps,
  StudentProjectUpgradesState
> {
  public _upgrade_is_invalid: boolean;
  private is_mounted: boolean = false;

  constructor(props) {
    super(props);
    this.state = {
      upgrade_quotas: false, // true if display the quota upgrade panel
      upgrades: {},
      upgrade_plan: undefined
    };
  }

  componentDidMount() {
    this.is_mounted = true;
  }

  componentWillUnmount() {
    this.is_mounted = false;
  }

  static reduxProps() {
    return { projects: { all_projects_have_been_loaded: rtypes.bool } };
  }

  get_actions(): CourseActions {
    return redux.getActions(this.props.name);
  }

  get_store(): CourseStore {
    return redux.getStore(this.props.name) as any;
  }

  upgrade_goal(): UpgradeGoal {
    const goal = {};
    for (const quota in this.state.upgrades) {
      let val = this.state.upgrades[quota];
      val = misc.parse_number_input(val, false);
      const { display_factor } = schema.PROJECT_UPGRADES.params[quota];
      goal[quota] = val / display_factor;
    }
    return goal;
  }

  save_upgrade_quotas = () => {
    this.setState({ upgrade_quotas: false });
    const a = this.get_actions();
    const upgrade_goal = this.upgrade_goal();
    a.configuration.set_upgrade_goal(upgrade_goal);
    a.student_projects.upgrade_all_student_projects(upgrade_goal);
  };

  render_upgrade_heading(num_projects) {
    return (
      <Row key="heading">
        <Col md={5}>
          <b style={{ fontSize: "11pt" }}>Quota</b>
        </Col>
        <Col md={7}>
          <b style={{ fontSize: "11pt" }}>
            Distribute upgrades to your {num_projects} student{" "}
            {misc.plural(num_projects, "project")} to get quota to the amount in
            this column (amounts may be decimals)
          </b>
        </Col>
      </Row>
    );
  }

  is_upgrade_input_valid(val, limit) {
    const parsed_val = misc.parse_number_input(val, false);
    if (parsed_val == null || parsed_val > Math.max(0, limit)) {
      // val=0 is always valid
      return false;
    } else {
      return true;
    }
  }

  render_upgrade_row_input(quota, input_type, yours, num_projects, limit) {
    let label, val;
    const ref = `upgrade_${quota}`;
    if (input_type === "number") {
      let style;
      val =
        this.state.upgrades[quota] != null
          ? this.state.upgrades[quota]
          : yours / num_projects;
      if (this.state.upgrades[quota] == null) {
        if (val === 0 && yours !== 0) {
          val = yours / num_projects;
        }
      }

      if (!this.is_upgrade_input_valid(val, limit)) {
        style = UPGRADE_ERROR_STYLE;
        this._upgrade_is_invalid = true;
        if (misc.parse_number_input(val) != null) {
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
            ref={ref}
            style={style}
            value={val}
            onChange={() => {
              const u = this.state.upgrades;
              u[quota] = ReactDOM.findDOMNode(this.refs[ref]).value;
              this.setState({ upgrades: u });
              this.update_plan();
            }}
          />
          {label}
        </FormGroup>
      );
    } else if (input_type === "checkbox") {
      val =
        this.state.upgrades[quota] != null
          ? this.state.upgrades[quota]
          : yours > 0
          ? 1
          : 0;
      const is_valid = this.is_upgrade_input_valid(val, limit);
      if (!is_valid) {
        this._upgrade_is_invalid = true;
        label = (
          <div style={UPGRADE_ERROR_STYLE}>
            Uncheck this: you do not have enough upgrades
          </div>
        );
      } else {
        label = val === 0 ? "Enable" : "Enabled";
      }
      return (
        <form>
          <Checkbox
            ref={ref}
            checked={val > 0}
            onChange={e => {
              const u = this.state.upgrades;
              u[quota] = (e.target as any).checked ? 1 : 0;
              this.setState({ upgrades: u });
              this.update_plan();
            }}
          />
          {label}
        </form>
      );
    } else {
      console.warn(
        "Invalid input type in render_upgrade_row_input: ",
        input_type
      );
      return;
    }
  }

  render_upgrade_row(quota, available, current, yours, num_projects) {
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
      input_type
    } = schema.PROJECT_UPGRADES.params[quota];

    yours *= display_factor;
    current *= display_factor;

    const x = this.state.upgrades[quota];
    let input: number;
    if (x == "") {
      input = 0;
    } else {
      const n = misc.parse_number_input(x);
      if (n == null) {
        input = n;
      } else {
        input = yours / num_projects; // currently typed in
      }
    }
    if (input_type === "checkbox") {
      input = input > 0 ? 1 : 0;
    }

    //#console.log(quota, "remaining = (#{available} - #{input}/#{display_factor}*#{num_projects}) * #{display_factor}")

    const remaining = misc.round2(
      (available - (input / display_factor) * num_projects) * display_factor
    );
    const limit = (available / num_projects) * display_factor;

    let cur = misc.round2(current / num_projects);
    if (input_type === "checkbox") {
      if (cur > 0 && cur < 1) {
        cur = `${misc.round2(cur * 100)}%`;
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
            ({remaining} {misc.plural(remaining, display_unit)} remaining)
          </span>
        </Col>
        <Col md={5}>
          {this.render_upgrade_row_input(
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

  render_upgrade_rows(
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
    this._upgrade_is_invalid = false; // will get set to true by render_upgrade_row if invalid.
    const result: any[] = [];
    for (const quota of schema.PROJECT_UPGRADES.field_order) {
      const total = purchased_upgrades[quota];
      const yours = your_upgrades[quota] != null ? your_upgrades[quota] : 0;
      const available =
        total -
        (applied_upgrades[quota] != null ? applied_upgrades[quota] : 0) +
        yours;
      const current = total_upgrades[quota] != null ? total_upgrades[quota] : 0;
      result.push(
        this.render_upgrade_row(quota, available, current, yours, num_projects)
      );
    }
    return result;
  }

  render_upgrade_quotas() {
    const { redux } = this.props;

    // Get available upgrades that instructor has to apply
    const account_store = redux.getStore("account");
    if (account_store == null) {
      return <Loading />;
    }

    const purchased_upgrades = account_store.get_total_upgrades();
    if (misc.is_zero_map(purchased_upgrades)) {
      // user has no upgrades on their account
      return (
        <NoUpgrades cancel={() => this.setState({ upgrade_quotas: false })} />
      );
    }

    const course_store = this.get_store();
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
          {this.render_upgrade_submit_buttons()}
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
      your_upgrades = misc.map_sum(
        your_upgrades,
        projects_store.get_upgrades_you_applied_to_project(project_id)
      );
      total_upgrades = misc.map_sum(
        total_upgrades,
        projects_store.get_total_project_upgrades(project_id)
      );
    }

    return (
      <Alert bsStyle="warning">
        <h3>
          <Icon name="arrow-circle-up" /> Adjust your contributions to the
          student project upgrades
        </h3>
        <hr />
        {this.render_upgrade_heading(num_projects)}
        <hr />
        {this.render_upgrade_rows(
          purchased_upgrades,
          applied_upgrades,
          num_projects,
          total_upgrades,
          your_upgrades
        )}
        <UpgradeRestartWarning />
        <br />
        {this.render_upgrade_submit_buttons()}
        <div style={{ marginTop: "15px", color: "#333" }}>
          {this.render_upgrade_plan()}
        </div>
        {this.render_admin_upgrade()}
      </Alert>
    );
  }

  save_admin_upgrade = e => {
    e.preventDefault();
    const s = ReactDOM.findDOMNode(this.refs.admin_input).value;
    const quotas = JSON.parse(s);
    // This console.log is intentional... because admin upgrade is only
    // for really advanced users (i.e., William).
    console.log(`admin upgrade '${s}' -->`, quotas);
    this.get_actions().student_projects.admin_upgrade_all_student_projects(
      quotas
    );
    return false;
  };

  render_admin_upgrade(): Rendered {
    const groups = redux.getStore("account").get("groups");
    if (groups == null || !groups.contains("admin")) {
      return;
    }
    return (
      <div>
        <br />
        <hr />
        <h3>Admin Upgrade</h3>
        Enter a Javascript-parseable object and hit enter (see the Javascript
        console for feedback). For example:
        <pre>
          {
            '{"network":1,"member_host":1,"disk_quota":3000,"cores":1,"cpu_shares":0,"memory_request":0,"mintime":43200,"member_host":1,"memory":1500}'
          }
        </pre>
        <form onSubmit={this.save_admin_upgrade}>
          <FormGroup>
            <FormControl
              ref="admin_input"
              type="text"
              placeholder={JSON.stringify(schema.DEFAULT_QUOTAS)}
            />
          </FormGroup>
        </form>
      </div>
    );
  }

  render_upgrade_submit_buttons() {
    return (
      <ButtonToolbar>
        <Button
          bsStyle="primary"
          onClick={this.save_upgrade_quotas}
          disabled={
            this.state.upgrade_plan == null ||
            misc.len(this.state.upgrade_plan) === 0
          }
        >
          <Icon name="arrow-circle-up" /> Apply changes
        </Button>
        <Button onClick={() => this.setState({ upgrade_quotas: false })}>
          Cancel
        </Button>
      </ButtonToolbar>
    );
  }

  // call this function to switch state from not viewing the upgrader to viewing the upgrader.
  adjust_quotas = async () => {
    if (!this.props.all_projects_have_been_loaded) {
      // See https://github.com/sagemathinc/cocalc/issues/3802
      const a = this.props.redux.getActions("projects");
      if (a != null) {
        this.setState({ loading_all_projects: true });
        await a.load_all_projects();
        if (!this.is_mounted) return;
        this.setState({ loading_all_projects: false });
      }
    }
    let left;
    const upgrades =
      (left =
        this.props.upgrade_goal != null
          ? this.props.upgrade_goal.toJS()
          : undefined) != null
        ? left
        : {};
    const upgrade_plan = this.get_store().get_upgrade_plan(upgrades);
    for (const quota in upgrades) {
      const val = upgrades[quota];
      upgrades[quota] =
        val * schema.PROJECT_UPGRADES.params[quota].display_factor;
    }
    this.setState({
      upgrade_quotas: true,
      upgrades,
      upgrade_plan
    });
  };

  update_plan() {
    const plan = this.get_store().get_upgrade_plan(this.upgrade_goal());
    this.setState({ upgrade_plan: plan });
  }

  render_upgrade_plan() {
    if (this.state.upgrade_plan == null) {
      return;
    }
    const n = misc.len(this.state.upgrade_plan);
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

  render_upgrade_quotas_button() {
    if (this.state.loading_all_projects) {
      return (
        <Button disabled={true} bsStyle="primary">
          <Icon name="arrow-circle-up" /> Adjust upgrades... (Loading)
        </Button>
      );
    }
    return (
      <Button bsStyle="primary" onClick={this.adjust_quotas}>
        <Icon name="arrow-circle-up" /> Adjust upgrades...
      </Button>
    );
  }

  handle_institute_pay_checkbox = e => {
    return this.get_actions().configuration.set_pay_choice(
      "institute",
      e.target.checked
    );
  };

  render_checkbox() {
    return (
      <span>
        <Checkbox
          checked={!!this.props.institute_pay}
          onChange={this.handle_institute_pay_checkbox}
        >
          You or your institute will pay for this course
        </Checkbox>
      </span>
    );
  }

  render_details() {
    return (
      <div>
        {this.state.upgrade_quotas
          ? this.render_upgrade_quotas()
          : this.render_upgrade_quotas_button()}
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

  render() {
    let bg, style;
    if (this.props.student_pay || this.props.institute_pay) {
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
        {this.render_checkbox()}
        {this.props.institute_pay ? this.render_details() : undefined}
      </Card>
    );
  }
}

const StudentProjectUpgrades0 = rclass(StudentProjectUpgrades);
export { StudentProjectUpgrades0 as StudentProjectUpgrades };
