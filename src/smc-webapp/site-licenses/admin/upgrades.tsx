/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Component, React, Rendered, useState } from "../../app-framework";
import { fromJS, Map } from "immutable";
import { DebounceInput } from "react-debounce-input";
import { upgrades } from "smc-util/upgrade-spec";
import { Row, Col, Dropdown, Menu } from "antd";
import { actions } from "./actions";
import {
  license_field_names,
  upgrade_fields_type,
  upgrade_fields,
} from "./types";
import { plural } from "smc-util/misc2";
import { Icon } from "../../r_misc";
import { INPUT_STYLE } from "./license";
import { presets } from "./upgrade-presets";

interface UpgradeParams {
  display: string;
  unit: string;
  display_unit: string;
  display_factor: number;
  pricing_unit: string;
  pricing_factor: number;
  input_type: string;
  desc: string;
}

function params(field: upgrade_fields_type): UpgradeParams {
  const p = upgrades.params[field];
  if (p == null) throw Error("bug");
  return p;
}

interface DisplayProps {
  upgrades: undefined | Map<string, number>; // assumed *already* scaled using scale_by_display_factors!!
  style?: React.CSSProperties; // only used if no warning about no upgrades.
}
export class DisplayUpgrades extends Component<DisplayProps> {
  private render_view(field: upgrade_fields_type): Rendered {
    if (this.props.upgrades == null || !this.props.upgrades.get(field)) return;
    let val = this.props.upgrades.get(field, 0);
    const { display_unit } = params(field);
    return (
      <span>
        {val} {plural(val, display_unit)}
      </span>
    );
  }

  private render_rows(): Rendered[] {
    const rows: Rendered[] = [];
    for (const field of upgrade_fields) {
      const view = this.render_view(field);
      if (view == null) continue;
      rows.push(
        <Row key={field}>
          <Col md={8}>{params(field).display}</Col>
          <Col md={16}>{view}</Col>
        </Row>
      );
    }
    return rows;
  }

  private render_no_upgrades_warning(): Rendered {
    return (
      <div>
        <Icon name="warning" /> No upgrades (deprecated)
      </div>
    );
  }

  public render(): Rendered {
    const rows = this.render_rows();
    if (rows.length == 0) {
      return this.render_no_upgrades_warning();
    } else {
      return <div style={this.props.style}>{rows}</div>;
    }
  }
}

interface EditProps {
  license_id: string;
  license_field: license_field_names;
  upgrades: undefined | Map<string, number | string>;
}

export const EditUpgrades: React.FC<EditProps> = (props) => {
  const [show, set_show] = useState<boolean>(false);

  function on_change(field: upgrade_fields_type, val: string): void {
    let upgrades = props.upgrades == null ? Map() : props.upgrades;
    upgrades = upgrades.set(field, val);
    actions.set_edit(props.license_id, props.license_field, upgrades);
  }

  function render_edit(field: upgrade_fields_type): Rendered {
    let val: string | number | undefined | number | undefined;
    if (props.upgrades == null || props.upgrades.get(field) == null) {
      val = "";
    } else {
      val = `${props.upgrades.get(field)}`;
    }
    return (
      <span>
        <DebounceInput
          onChange={(e) => on_change(field, (e.target as any).value)}
          value={val}
          style={INPUT_STYLE}
        />{" "}
        {params(field).display_unit}
      </span>
    );
  }

  function render_rows(): Rendered[] {
    const rows: Rendered[] = [];
    for (const field of upgrade_fields) {
      rows.push(
        <Row key={field}>
          <Col md={8}>{params(field).display}</Col>
          <Col md={16}>{render_edit(field)}</Col>
        </Row>
      );
    }
    return rows;
  }

  function render_preset_item(product): Rendered {
    return (
      <Menu.Item
        onClick={() =>
          actions.set_edit(
            props.license_id,
            props.license_field,
            scale_by_display_factors(fromJS(product.upgrades))
          )
        }
        key={product.desc}
      >
        {product.desc}
      </Menu.Item>
    );
  }

  function render_presets(): Rendered {
    const v: Rendered[] = [];
    const PRESETS = presets();
    for (const preset in PRESETS) {
      v.push(render_preset_item(PRESETS[preset]));
    }
    return (
      <Row key={"presets"}>
        <Col md={8}></Col>
        <Col md={16}>
          <Dropdown overlay={<Menu>{v}</Menu>}>
            <a className="ant-dropdown-link" href="#">
              Presets <Icon name="caret-down" />
            </a>
          </Dropdown>
        </Col>
      </Row>
    );
  }

  if (!show) {
    return (
      <div>
        <a onClick={() => set_show(true)}>
          Upgrades will be deprecated (click to edit anyways)...
        </a>
      </div>
    );
  }

  return (
    <div>
      {render_presets()}
      {render_rows()}
    </div>
  );
};

export function normalize_upgrades_for_save(
  obj: {
    [field in upgrade_fields_type]: any;
  }
): void {
  for (const field in obj) {
    const { display_factor, input_type } = params(field as upgrade_fields_type);
    const val = (input_type == "number" ? parseFloat : parseInt)(obj[field]);
    if (isNaN(val) || !isFinite(val) || val < 0) {
      obj[field] = 0;
    } else {
      obj[field] = Math.min(
        val / display_factor,
        upgrades.max_per_project[field]
      );
    }
  }
}

export function scale_by_display_factors(
  upgrades: Map<string, number>
): Map<string, number> {
  let x: Map<string, number> = Map();
  for (const [field, val] of upgrades) {
    x = x.set(field, val * params(field as upgrade_fields_type).display_factor);
  }
  return x;
}
