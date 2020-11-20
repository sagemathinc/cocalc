/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Takes current upgrades data and quota parameters and provides an interface for
the user to update these parameters. submit_upgrade_quotas will receive a
javascript object in the same format as quota_params cancel_upgrading takes no
arguments and is called when the cancel button is hit.
*/

import { CSS, React, redux, useForceUpdate, useState } from "../app-framework";
import {
  is_zero_map,
  map_diff,
  map_limit,
  map_max,
  map_sum,
  plural,
} from "smc-util/misc";
import { parse_number_input, round2 } from "smc-util/misc2";
import { PROJECT_UPGRADES } from "smc-util/schema";
import { NoUpgrades } from "./no-upgrades";
import {
  Alert,
  Button,
  ButtonToolbar,
  FormControl,
  FormGroup,
  InputGroup,
  Row,
  Col,
} from "../antd-bootstrap";
import { Button as OldButton } from "react-bootstrap";
import { UpgradeRestartWarning } from "../upgrade-restart-warning";
import { UPGRADE_ERROR_STYLE } from "./no-upgrades";
import { Tip } from "./tip";
import { Checkbox } from "antd";
import { Icon } from "./icon";

type UpgradeQuotas = any;

interface Props {
  quota_params: object; // from the schema
  total_project_quotas?: object;
  submit_upgrade_quotas: (quotas: UpgradeQuotas) => void;
  cancel_upgrading: () => void;
  disable_submit?: boolean;
  upgrades_you_can_use?: object;
  upgrades_you_applied_to_all_projects?: object;
  upgrades_you_applied_to_this_project?: object;
  omit_header?: boolean;
  style?: CSS;
}

export const UpgradeAdjustor: React.FC<Props> = (props) => {
  const force_update = useForceUpdate();
  const [upgrade_state, set_upgrade_state] = useState<UpgradeQuotas>(() => {
    const state: UpgradeQuotas = {};

    const current = props.upgrades_you_applied_to_this_project ?? {};

    for (let name in props.quota_params) {
      const factor = props.quota_params[name].display_factor;
      state[name] = round2((current[name] ?? 0) * factor);
    }

    return state;
  });

  function set_state(name, val): void {
    upgrade_state[name] = val; // make the change
    set_upgrade_state(upgrade_state); // no-op?
    force_update(); // triggers a UI update
  }

  function get_quota_info() {
    // This function is quite confusing and tricky.
    // It combines the remaining upgrades of the user with the already applied ones by the same user.
    // Then it limits the applyable upgrades by what's still possible to apply until the
    // maximum is reached.
    //
    // My mental model:
    //
    //   0                           total_upgrades     proj_maximum
    //   |<-------------------------------->|                |
    //   |<----->|<------------------------>|<-------------->|
    //   | admin |  all upgrades by users   | proj remainder |
    //   | +     |<------------>|<--------->|<--------->|    |
    //   | free  |  other users | this user | remaining |    |
    //   |       |              |           | this user |    |
    //   |       |              |<--------------------->|    |
    //   |       |              |  limit for this user  | <= | max
    //
    //   admin/free: could be 0
    //   all upgrades by users is total_project_quotas
    //   remainder: >=0, usually, but if there are already too many upgrades it is negative!
    //   this user: upgrades_you_applied_to_this_project. this is >= 0!
    //   limit for this user: is capped by the user's overall quotas AND the quota maximum

    // NOTE : all units are 'internal' instead of display, e.g. seconds instead of hours
    // how much upgrade you have used between all projects
    const user_upgrades = props.upgrades_you_applied_to_all_projects ?? {};
    // how much upgrade you currently use on this one project
    const user_current = props.upgrades_you_applied_to_this_project ?? {};
    // all currently applied upgrades to this project
    const total_upgrades = props.total_project_quotas ?? {};
    // how much unused upgrade you have remaining
    const user_remaining = map_diff(props.upgrades_you_can_use as any, user_upgrades as any);
    // the overall limits are capped by the maximum per project
    const proj_maximum = PROJECT_UPGRADES.max_per_project;
    // and they're also limited by what everyone has already applied
    const proj_remainder = map_diff(proj_maximum, total_upgrades as any);
    // note: if quota already exeeds, proj_remainder might have negative values -- don't cap at 0
    // the overall limit for the user is capped by what's left for the project
    const limits = map_limit(user_remaining, proj_remainder);
    // and finally, we add up what a user can add (with the maybe negative remainder) and cap at 0
    const user_limits = map_max(map_sum(limits, user_current as any), 0);
    return {
      limits: user_limits,
      remaining: user_remaining,
      current: user_current,
      totals: total_upgrades,
      proj_remainder,
    };
  }

  function clear_upgrades() {
    set_upgrades("min");
  }

  function max_upgrades() {
    set_upgrades("max");
  }

  function set_upgrades(description) {
    const info = get_quota_info();
    const new_upgrade_state = {};
    for (let name in props.quota_params) {
      var current_value;
      const data = props.quota_params[name];
      const factor = data.display_factor;
      switch (description) {
        case "max":
          current_value = info.limits[name];
          break;
        case "min":
          current_value = 0;
          break;
      }
      new_upgrade_state[name] = round2(current_value * factor);
    }

    set_upgrade_state(new_upgrade_state);
  }

  function is_upgrade_input_valid(input, max): boolean {
    const val = parse_number_input(input, false);
    if (val == null || val > Math.max(0, max)) {
      return false;
    } else {
      return true;
    }
  }

  // the max button will set the upgrade input box to the number given as max
  function render_max_button(name, max): JSX.Element {
    return (
      <OldButton
        bsSize="small"
        onClick={() => set_state(name, max)}
        style={{ padding: "0px 5px" }}
      >
        Max
      </OldButton>
    );
  }

  function render_addon(name, display_unit, limit) {
    return (
      <span style={{ minWidth: "81px", display: "inline-block" }}>
        {`${plural(2, display_unit)}`} {render_max_button(name, limit)}
      </span>
    );
  }

  function render_upgrade_row(
    name,
    data,
    remaining: number,
    current: number,
    limit: number,
    total: number,
    proj_remainder: number
  ) {
    let label, reason, reasons, show_remaining, val;
    if (data == null) {
      return;
    }

    let { display, desc, display_factor, display_unit, input_type } = data;

    if (input_type === "checkbox") {
      // the remaining count should decrease if box is checked
      val = upgrade_state[name];
      show_remaining = remaining + current - val;
      show_remaining = Math.max(show_remaining, 0);

      if (!is_upgrade_input_valid(Math.max(val, 0), limit)) {
        reasons = [];
        if (val > remaining + current) {
          reasons.push("you do not have enough upgrades");
        }
        if (val > proj_remainder + current) {
          reasons.push("exceeds the limit");
        }
        reason = reasons.join(" and ");
        label = <div style={UPGRADE_ERROR_STYLE}>Uncheck this: {reason}</div>;
      } else {
        label = val === 0 ? "Disabled" : "Enabled";
      }

      const is_upgraded = total >= 1 ? "(already upgraded)" : "(not upgraded)";

      return (
        <Row key={name} style={{ marginTop: "5px" }}>
          <Col sm={6}>
            <Tip title={display} tip={desc}>
              <strong>{display}</strong> {is_upgraded}
            </Tip>
            <br />
            You have {show_remaining} unallocated{" "}
            {plural(show_remaining, display_unit)}
          </Col>
          <Col sm={6}>
            <form style={{ float: "right" }}>
              <Checkbox
                checked={val > 0}
                onChange={(e) => set_state(name, e.target.checked ? 1 : 0)}
              >
                {label}
              </Checkbox>
            </form>
          </Col>
        </Row>
      );
    } else if (input_type === "number") {
      let style, remaining_note;
      remaining = round2(remaining * display_factor);
      proj_remainder = round2(proj_remainder * display_factor);
      const display_current = current * display_factor; // current already applied
      if (current !== 0 && round2(display_current) !== 0) {
        current = round2(display_current);
      } else {
        current = display_current;
      }

      limit = round2(limit * display_factor);
      const current_input = parse_number_input(upgrade_state[name]) ?? 0; // current typed in

      // the amount displayed remaining subtracts off the amount you type in
      show_remaining = round2(remaining + current - current_input);

      const val_state = upgrade_state[name];
      val = parse_number_input(val_state);
      if (val != null) {
        if (!is_upgrade_input_valid(Math.max(val, 0), limit)) {
          reasons = [];
          if (val > remaining + current) {
            reasons.push("not enough upgrades");
          }
          if (val > proj_remainder + current) {
            reasons.push("exceeding limit");
          }
          reason = reasons.join(" and ");
          style = { border: "1px solid red" }; // TODO!
          label = (
            <div style={UPGRADE_ERROR_STYLE}>Value too high: {reason}</div>
          );
        } else {
          label = <span></span>;
        }
      } else {
        label = <div style={UPGRADE_ERROR_STYLE}>Please enter a number</div>;
      }

      const remaining_all = Math.max(show_remaining, 0);
      const schema_limit = PROJECT_UPGRADES.max_per_project;
      ({ display_factor } = PROJECT_UPGRADES.params[name]);
      // calculates the amount of remaining quotas: limited by the max upgrades and subtract the already applied quotas
      const total_limit = round2(schema_limit[name] * display_factor);
      const show_total = round2(total * display_factor);

      const unit = plural(show_remaining, display_unit);
      if (limit < remaining) {
        remaining_note = (
          <span>
            You have {remaining_all} unallocated {unit}
            <br />
            (You may allocate up to {limit} {unit} here)
          </span>
        );
      } else {
        remaining_note = (
          <span>
            You have {remaining_all} unallocated {unit}
          </span>
        );
      }

      return (
        <Row key={name} style={{ marginTop: "5px" }}>
          <Col sm={7}>
            <Tip title={display} tip={desc}>
              <strong>{display}</strong> (current: {show_total} {unit}, max
              allowed: {total_limit} {unit})
            </Tip>
            <br />
            {remaining_note}
          </Col>
          <Col sm={5}>
            <FormGroup>
              <InputGroup>
                <FormControl
                  type={"text"}
                  value={val_state}
                  style={style}
                  onChange={(e) => set_state(name, (e.target as any).value)}
                />
                <InputGroup.Addon>
                  {render_addon(name, display_unit, limit)}
                </InputGroup.Addon>
              </InputGroup>
            </FormGroup>
            {label}
          </Col>
        </Row>
      );
    } else {
      console.warn("Invalid input type in render_upgrade_row: ", input_type);
      return;
    }
  }

  function save_upgrade_quotas(remaining) {
    const current = props.upgrades_you_applied_to_this_project ?? {};
    const new_upgrade_quotas = {};
    const new_upgrade_state = {};
    for (let name in props.quota_params) {
      var input, val;
      const data = props.quota_params[name];
      const factor = data.display_factor;
      const current_val = round2((current[name] ?? 0) * factor);
      const remaining_val = Math.max(
        round2((remaining[name] ?? 0) * factor),
        0
      ); // everything is now in display units

      if (data.input_type === "checkbox") {
        input = upgrade_state[name] ?? current_val;
        if (input && (remaining_val > 0 || current_val > 0)) {
          val = 1;
        } else {
          val = 0;
        }
      } else {
        // parse the current user input, and default to the current value if it is (somehow) invalid
        input = parse_number_input(upgrade_state[name]) ?? current_val;
        input = Math.max(input, 0);
        const limit = current_val + remaining_val;
        val = Math.min(input, limit);
      }

      new_upgrade_state[name] = val;
      new_upgrade_quotas[name] = round2(val / factor);
    } // only now go back to internal units

    props.submit_upgrade_quotas(new_upgrade_quotas);
    // set the state so that the numbers are right if you click upgrade again
    set_upgrade_state(new_upgrade_state);
  }

  // Returns true if the inputs are valid and different:
  //    - at least one has changed
  //    - none are negative
  //    - none are empty
  //    - none are higher than their limit
  function valid_changed_upgrade_inputs(current, limits) {
    let changed;
    for (let name in props.quota_params) {
      const data = props.quota_params[name];
      const factor = data.display_factor;
      // the highest number the user is allowed to type
      const limit = Math.max(0, round2((limits[name] ?? 0) * factor)); // max since 0 is always allowed
      // the current amount applied to the project
      const cur_val = round2((current[name] ?? 0) * factor);
      // the current number the user has typed (undefined if invalid)
      const new_val = parse_number_input(upgrade_state[name]);
      if (
        (new_val == null || new_val > limit) &&
        data.input_type !== "checkbox"
      ) {
        return false;
      }
      if (cur_val !== new_val) {
        changed = true;
      }
    }
    return changed;
  }

  function show_account_upgrades() {
    redux.getActions("page").set_active_tab("account");
    return redux.getActions("account").set_active_tab("upgrades");
  }

  if (is_zero_map(props.upgrades_you_can_use)) {
    // user has no upgrades on their account
    return <NoUpgrades cancel={props.cancel_upgrading} />;
  } else {
    const {
      limits,
      remaining,
      current,
      totals,
      proj_remainder,
    } = get_quota_info();
    const buttons = (
      <ButtonToolbar style={{ marginTop: "10px" }}>
        <Button
          bsStyle="success"
          onClick={() => save_upgrade_quotas(remaining)}
          disabled={
            props.disable_submit ||
            !valid_changed_upgrade_inputs(current, limits)
          }
        >
          <Icon name="arrow-circle-up" /> Save Changes
        </Button>
        <Button onClick={props.cancel_upgrading}>Cancel</Button>
      </ButtonToolbar>
    );

    return (
      <Alert bsStyle="warning" style={props.style}>
        {!props.omit_header && (
          <div>
            <h3>
              <Icon name="arrow-circle-up" /> Adjust your upgrade contributions
              to this project
            </h3>

            <div style={{ color: "#666" }}>
              Adjust <i>your</i> contributions to the quotas on this project
              (disk space, memory, cores, etc.). The total quotas for this
              project are the sum of the contributions of all collaborators and
              the free base quotas.{" "}
              <a onClick={show_account_upgrades} style={{ cursor: "pointer" }}>
                See your current upgrade allocations...
              </a>
            </div>
          </div>
        )}
        <div style={{ marginTop: "10px" }}>
          <Button onClick={max_upgrades}>
            Apply maximum available upgrades to this project...
          </Button>{" "}
          <Button onClick={clear_upgrades}>
            Remove all your upgrades from this project...
          </Button>
          {buttons}
        </div>
        <hr />
        <Row>
          <Col md={6}>
            <b style={{ fontSize: "14pt" }}>Quota</b>
          </Col>
          <Col md={6}>
            <b style={{ fontSize: "14pt", float: "right" }}>
              Your contribution
            </b>
          </Col>
        </Row>
        <hr />

        {PROJECT_UPGRADES.field_order.map((name) => {
          return render_upgrade_row(
            name,
            props.quota_params[name] ?? 0,
            remaining[name] ?? 0,
            current[name] ?? 0,
            limits[name] ?? 0,
            totals[name] ?? 0,
            proj_remainder[name] ?? 0
          );
        })}
        <UpgradeRestartWarning style={{ marginTop: "15px" }} />
        {props.children}
        {buttons}
      </Alert>
    );
  }
};

UpgradeAdjustor.defaultProps = {
  upgrades_you_can_use: {},
  upgrades_you_applied_to_all_projects: {},
  upgrades_you_applied_to_this_project: {},
  omit_header: false,
};
