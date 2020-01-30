import { Component, React, Rendered } from "../../app-framework";
import { Map } from "immutable";
import { upgrades } from "smc-util/upgrade-spec";
import { Row, Col } from "antd";
import { actions } from "./actions";
import {
  license_field_names,
  upgrade_fields_type,
  upgrade_fields
} from "./types";
import { plural } from "smc-util/misc2";


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
  upgrades: undefined | Map<string, number>;
}
export class DisplayUpgrades extends Component<DisplayProps> {
  private render_view(field: upgrade_fields_type): Rendered {
    if (this.props.upgrades == null || !this.props.upgrades.get(field)) return;
    let val = this.props.upgrades.get(field, 0);
    const { display_factor, display_unit } = params(field);
    return (
      <span>
        {val * display_factor} {plural(val * display_factor, display_unit)}
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

  public render(): Rendered {
    return <div>{this.render_rows()}</div>;
  }
}

interface EditProps {
  license_id: string;
  license_field: license_field_names;
  upgrades: undefined | Map<string, number>;
  onChange: Function;
}

export class EditUpgrades extends Component<EditProps> {
  private on_change(field: upgrade_fields_type, val: string): void {
    let upgrades = this.props.upgrades == null ? Map() : this.props.upgrades;
    upgrades = upgrades.set(field, val);
    actions.set_edit(this.props.license_id, this.props.license_field, upgrades);
  }

  private render_edit(field: upgrade_fields_type): Rendered {
    let val: string | number | undefined | number | undefined;
    if (this.props.upgrades == null || this.props.upgrades.get(field) == null) {
      val = "";
    } else {
      val = this.props.upgrades.get(field);
      if (typeof val == "number") {
        val = val * params(field).display_factor;
      }
      val = `${val}`;
    }
    return (
      <span>
        <input
          onChange={e => this.on_change(field, (e.target as any).value)}
          value={val}
        />{" "}
        {params(field).display_unit}
      </span>
    );
  }

  private render_rows(): Rendered[] {
    const rows: Rendered[] = [];
    for (const field of upgrade_fields) {
      rows.push(
        <Row key={field}>
          <Col md={8}>{params(field).display}</Col>
          <Col md={16}>{this.render_edit(field)}</Col>
        </Row>
      );
    }
    return rows;
  }

  public render(): Rendered {
    return <div>{this.render_rows()}</div>;
  }
}

export function normalize_upgrades_for_save(obj: {
  [field: upgrade_fields_type]: any;
}): void {
  for (const field in obj) {
    const val = parseInt(obj[field]);
    if (isNaN(val) || !isFinite(val) || val < 0) {
      obj[field] = 0;
    } else {
      obj[field] = Math.min(
        val / params(field as upgrade_fields_type).display_factor,
        upgrades.max_per_project[field]
      );
    }
  }
}
