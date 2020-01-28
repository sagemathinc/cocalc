import { React, Rendered, Component, TypedMap } from "../../app-framework";
import { SiteLicense } from "./types";
import { actions } from "./actions";
import { Button, ButtonGroup } from "../../antd-bootstrap";
import { Row, Col } from "antd";
import { license_fields, license_field_type } from "./types";
import { capitalize, is_date, replace_all } from "smc-util/misc2";
import { DateTimePicker, NumberInput, TimeAgo } from "../../r_misc";
import { Checkbox } from "../../antd-bootstrap";
import { DisplayUpgrades, EditUpgrades } from "./upgrades";

interface Props {
  editing?: boolean;
  license: TypedMap<SiteLicense>;
  edits?: TypedMap<SiteLicense>;
}

function format_as_label(field: string): string {
  return replace_all(capitalize(field), "_", " ");
}

export class License extends Component<Props> {
  private render_data(): Rendered[] {
    const v: Rendered[] = [];
    const edits = this.props.edits;
    for (const field in license_fields) {
      const val =
        this.props.editing && edits != null && edits.has(field)
          ? edits.get(field)
          : this.props.license.get(field);
      if (val == null && !this.props.editing) continue;
      v.push(
        <Row key={field} style={{ borderBottom: "1px solid lightgrey" }}>
          <Col span={4}>{format_as_label(field)}</Col>
          <Col span={20}>
            {this.render_value(field, val)}
            {field == "id" ? this.render_buttons() : undefined}
          </Col>
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
              <NumberInput
                on_change={onChange}
                min={0}
                unit="projects"
                number={val != null ? val : 0}
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
    return x;
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
    return <div style={{ float: "right", marginTop: "-10px" }}>{buttons}</div>;
  }

  public render(): Rendered {
    return (
      <div
        style={{
          border: "1px solid lightgrey",
          borderRadius: "3px",
          padding: "10px",
          backgroundColor: "#fcfcfc"
        }}
      >
        {this.render_data()}
      </div>
    );
  }
}
