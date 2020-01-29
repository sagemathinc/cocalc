import { React, Rendered, Component, TypedMap } from "../../app-framework";
import { SiteLicense } from "./types";
import { actions } from "./actions";
import { Button, ButtonGroup } from "../../antd-bootstrap";
import { Row, Col } from "antd";
import { license_fields, license_field_type } from "./types";
import { capitalize, is_date, replace_all } from "smc-util/misc2";
import { plural } from "smc-util/misc";
import { DateTimePicker, TimeAgo } from "../../r_misc";
import { Checkbox } from "../../antd-bootstrap";
import { DisplayUpgrades, EditUpgrades } from "./upgrades";

const BACKGROUNDS = ["white", "#fafafa"];

interface Props {
  editing?: boolean;
  license: TypedMap<SiteLicense>;
  edits?: TypedMap<SiteLicense>;
  usage_stats?: number; // for now this is just the number of projects running right now with the license; later it might have hourly/daily/weekly, active, etc.
}

function format_as_label(field: string): string {
  return replace_all(capitalize(field), "_", " ");
}

export class License extends Component<Props> {
  private render_data(): Rendered[] {
    const v: Rendered[] = [];
    const edits = this.props.edits;
    let i = 0;
    for (const field in license_fields) {
      const val =
        this.props.editing && edits != null && edits.has(field)
          ? edits.get(field)
          : this.props.license.get(field);
      if (val == null && !this.props.editing) continue;
      const backgroundColor = BACKGROUNDS[i % 2];
      i += 1;
      let x = this.render_value(field, val);
      if (field == "id") {
        x = (
          <>
            <pre style={{ display: "inline-block", margin: 0, color: "#666" }}>
              {x}
            </pre>
            {this.render_buttons()}
          </>
        );
      }
      v.push(
        <Row
          key={field}
          style={{
            borderBottom: "1px solid lightgrey",
            backgroundColor,
            padding: this.props.editing ? "5px 0" : undefined
          }}
        >
          <Col span={4}>{format_as_label(field)}</Col>
          <Col span={20}>{x}</Col>
        </Row>
      );
    }
    return v;
  }

  private on_change(field, new_val): void {
    actions.set_edit(this.props.license.get("id"), field, new_val);
  }

  private render_value(field, val): Rendered | string {
    let x: Rendered | string = undefined;
    const type: license_field_type = license_fields[field];
    if (this.props.editing) {
      const onChange = new_val => this.on_change(field, new_val);
      switch (type) {
        case "string":
          x = (
            <input
              style={{ width: "100%" }}
              value={val != null ? val : ""}
              onChange={e => onChange((e.target as any).value)}
            />
          );
          break;
        case "paragraph":
          x = (
            <textarea
              style={{ width: "100%", border: "1px solid lightgray" }}
              rows={3}
              value={val != null ? val : ""}
              onChange={e => onChange((e.target as any).value)}
            />
          );
          break;
        case "date":
          x = (
            <DateTimePicker
              value={val}
              onChange={onChange}
              style={{ width: "100%" }}
            />
          );
          break;
        case "account_id[]":
          x = "(TODO: list of users)";
          break;
        case "boolean":
          x = (
            <Checkbox
              checked={!!val}
              onChange={e => onChange((e.target as any).checked)}
            />
          );
          break;
        case "upgrades":
          x = (
            <EditUpgrades
              upgrades={val}
              onChange={onChange}
              license_id={this.props.license.get("id")}
              license_field={field}
            />
          );
          break;
        case "number":
          x = (
            <span>
              <input
                style={{ width: "100%" }}
                value={val != null ? val : "0"}
                onChange={e => onChange((e.target as any).value)}
              />{" "}
              (0 = no limits)
            </span>
          );
          break;
        case "readonly":
        default:
          if (is_date(val)) {
            x = <TimeAgo date={val} />;
          } else {
            x = `${val}`;
          }
      }
    } else {
      switch (type) {
        case "paragraph":
          x = <div style={{ whiteSpace: "pre" }}>{val}</div>;
          break;
        case "date":
          if (val == null) {
            x = "";
          } else {
            x = <TimeAgo date={val} />;
          }
          break;
        case "upgrades":
          x = <DisplayUpgrades upgrades={val} />;
          break;
        default:
          x = `${val}`;
      }
    }

    if (field == "run_limit" && this.props.usage_stats) {
      return (
        <Row>
          <Col md={8}>{x}</Col>
          <Col md={16}>{this.render_usage_stats(val)}</Col>
        </Row>
      );
    }

    return x;
  }

  private render_usage_stats(run_limit): Rendered {
    if (!this.props.usage_stats) return;
    const style: React.CSSProperties = { fontStyle: "italic" };
    if (run_limit && this.props.usage_stats >= run_limit) {
      // hitting the limit -- make it clearer!
      style.color = "red";
      style.fontWeight = "bold";
    }
    return (
      <span style={style}>
        {this.props.usage_stats} running{" "}
        {plural(this.props.usage_stats, "project")} currently using this
        license.
      </span>
    );
  }

  private render_buttons(): Rendered {
    let buttons;
    const id = this.props.license.get("id");
    if (this.props.editing) {
      buttons = (
        <ButtonGroup>
          <Button onClick={() => actions.cancel_editing(id)}>Cancel</Button>
          <Button
            disabled={this.props.edits == null || this.props.edits.size <= 1}
            bsStyle="success"
            onClick={() => actions.save_editing(id)}
          >
            Save
          </Button>
        </ButtonGroup>
      );
    } else {
      buttons = <Button onClick={() => actions.start_editing(id)}>Edit</Button>;
    }
    return <div style={{ float: "right" }}>{buttons}</div>;
  }

  public render(): Rendered {
    return (
      <div
        style={{
          border: "1px solid lightgrey",
          borderRadius: "5px",
          padding: "10px"
        }}
      >
        {this.render_data()}
      </div>
    );
  }
}
