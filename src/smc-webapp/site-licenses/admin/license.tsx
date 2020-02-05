import { React, Rendered, Component, TypedMap } from "../../app-framework";
import { DebounceInput } from "react-debounce-input";
import { SiteLicense } from "./types";
import { actions } from "./actions";
import { Button, ButtonGroup } from "../../antd-bootstrap";
import { Alert, Row, Col } from "antd";
import { license_fields, license_field_type } from "./types";
import {
  capitalize,
  is_date,
  merge,
  replace_all,
  plural
} from "smc-util/misc2";
import { CopyToClipBoard, DateTimePicker, TimeAgo, Icon } from "../../r_misc";
import { Checkbox } from "../../antd-bootstrap";
import {
  DisplayUpgrades,
  EditUpgrades,
  scale_by_display_factors
} from "./upgrades";
import { Projects } from "../../admin/users/projects";

const BACKGROUNDS = ["white", "#f8f8f8"];

interface Props {
  editing?: boolean;
  saving?: boolean;
  show_projects?: boolean;
  license: TypedMap<SiteLicense>;
  edits?: TypedMap<SiteLicense>;
  usage_stats?: number; // for now this is just the number of projects running right now with the license; later it might have hourly/daily/weekly, active, etc.
}

function format_as_label(field: string): string {
  return replace_all(capitalize(field), "_", " ");
}

const STATUS_STYLE: React.CSSProperties = {
  display: "inline-block",
  marginBottom: "5px"
};

export const INPUT_STYLE: React.CSSProperties = {
  border: "1px solid lightgrey",
  borderRadius: "3px",
  padding: "0 5px"
};

export class License extends Component<Props> {
  private render_data(): Rendered[] {
    const v: Rendered[] = [];
    const edits = this.props.edits;
    let i = 0;
    for (const field in license_fields) {
      let val;
      if (this.props.editing && edits != null && edits.has(field)) {
        val = edits.get(field);
      } else {
        val = this.props.license.get(field);
        if (val != null && field == "upgrades") {
          // tedious detail: some upgrades have to be scaled before displaying to be edited...
          val = scale_by_display_factors(val);
        }
      }
      const backgroundColor = BACKGROUNDS[i % 2];
      i += 1;
      let x = this.render_value(field, val);
      if (field == "id") {
        x = (
          <>
            <CopyToClipBoard
              value={x}
              style={{ display: "inline-block", width: "50ex", margin: 0 }}
            />
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
            <DebounceInput
              style={merge({ width: "50ex" }, INPUT_STYLE)}
              value={val != null ? val : ""}
              onChange={e => onChange((e.target as any).value)}
            />
          );
          if (field == "title") {
            x = <span>{x} (visible to anyone who knows the id)</span>;
          }
          break;
        case "paragraph":
          x = (
            <DebounceInput
              element="textarea"
              forceNotifyByEnter={false}
              style={merge({ width: "100%" }, INPUT_STYLE)}
              rows={5}
              value={val != null ? val : ""}
              onChange={e => onChange((e.target as any).value)}
            />
          );
          if (field == "description") {
            x = (
              <div>
                {x}
                <br />
                (description is only visible to license managers)
              </div>
            );
          }
          break;
        case "date":
          if (field == "created" || field == "last_used") {
            x = <TimeAgo date={val} />;
          } else {
            x = (
              <DateTimePicker
                value={val}
                onChange={onChange}
                style={{ width: "100%", maxWidth: "40ex" }}
              />
            );
          }
          break;
        case "account_id[]":
          x = "(TODO: list of managers)";
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
              <DebounceInput
                style={merge({ width: "100%" }, INPUT_STYLE)}
                value={val != null ? val : "0"}
                onChange={e => onChange((e.target as any).value)}
              />{" "}
              (0 = no limit)
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
          x = (
            <div
              style={{
                whiteSpace: "pre",
                background: val ? undefined : "yellow"
              }}
            >
              {val ? val : "Please enter a description"}
            </div>
          );
          break;
        case "string":
          x = (
            <div
              style={{
                whiteSpace: "pre",
                background: val ? undefined : "yellow"
              }}
            >
              {val ? val : "Please enter a title"}
            </div>
          );
          break;
        case "date":
          if (val == null) {
            x = "";
          } else {
            x = <TimeAgo date={val} />;
          }
          if (field == "expires") {
            if (!val) {
              x = (
                <span style={{ background: "yellow" }}>
                  <Icon name="warning" /> Never expires -- you should probably
                  set an expiration date
                </span>
              );
            } else if (val <= new Date()) {
              x = (
                <span
                  style={{
                    background: "darkred",
                    color: "white"
                  }}
                >
                  Expired {x}
                </span>
              );
            } else {
              x = <span>Will expire {x}</span>;
            }
          } else if (field == "activates") {
            if (!val) {
              x = (
                <div
                  style={{
                    background: "darkred",
                    color: "white"
                  }}
                >
                  <Icon name="warning" /> Never actives -- please set an
                  activation date!
                </div>
              );
            } else if (val > new Date()) {
              x = (
                <div
                  style={{
                    background: "darkred",
                    color: "white"
                  }}
                >
                  Will activate {x}
                </div>
              );
            } else {
              x = <span>Activated {x}</span>;
            }
          }
          break;
        case "upgrades":
          x = <DisplayUpgrades upgrades={val} />;
          break;
        default:
          x = `${val}`;
      }
      if (field == "run_limit" && !val) {
        x = (
          <div
            style={{
              background: "yellow"
            }}
          >
            <Icon name="warning" /> No limit -- you should probably set a limit
          </div>
        );
      }
    }

    if (field == "run_limit" && this.props.usage_stats) {
      x = (
        <Row>
          <Col md={8}>{x}</Col>
          <Col md={16}>{this.render_usage_stats(val)}</Col>
        </Row>
      );
    }

    return x;
  }

  private render_projects(): Rendered {
    if (!this.props.show_projects) return;
    return (
      <div style={{ marginTop: "30px" }}>
        <Projects
          license_id={this.props.license.get("id")}
          title={"Running projects upgraded with this license"}
        />
      </div>
    );
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
      <a
        onClick={() =>
          actions.toggle_show_projects(this.props.license.get("id"))
        }
        style={style}
      >
        {this.props.usage_stats} running{" "}
        {plural(this.props.usage_stats, "project")} currently using this
        license...
      </a>
    );
  }

  private render_buttons(): Rendered {
    let buttons;
    const id = this.props.license.get("id");
    if (this.props.editing) {
      buttons = (
        <ButtonGroup>
          <Button
            onClick={() => actions.cancel_editing(id)}
            disabled={this.props.saving}
          >
            Cancel
          </Button>
          <Button
            disabled={
              this.props.edits == null ||
              this.props.edits.size <= 1 ||
              this.props.saving
            }
            bsStyle="success"
            onClick={() => actions.save_editing(id)}
          >
            <Icon name={"save"} /> {this.props.saving ? "Saving..." : "Save"}
          </Button>
        </ButtonGroup>
      );
    } else {
      buttons = <Button onClick={() => actions.start_editing(id)}>Edit</Button>;
    }
    return <div style={{ float: "right" }}>{buttons}</div>;
  }

  private is_active(): { is_active: boolean; why_not?: string } {
    // Is it active?
    const activates = this.props.license.get("activates");
    if (!activates)
      return { is_active: false, why_not: "no activation date set" };
    if (activates > new Date())
      return { is_active: false, why_not: "it has not yet become activated" };
    // Has it expired?
    const expires = this.props.license.get("expires");
    if (expires && expires <= new Date())
      return { is_active: false, why_not: "it has expired" };
    // Any actual upgrades?
    const upgrades = this.props.license.get("upgrades");
    if (upgrades == null || upgrades.size == 0)
      return { is_active: false, why_not: "no upgrades are configured" };

    for (let [field, val] of upgrades) {
      field = field; // typescript
      if (val) return { is_active: true }; // actual upgrade, so yes is having an impact.
    }
    return { is_active: false, why_not: "no upgrades are configured" };
  }

  // Show a message explaining whether -- with the current saved settings --
  // this license will upgrade any projects.  Only shown in view mode, to
  // avoid potentional confusion in edit mode.
  private render_status(): Rendered {
    if (this.props.editing) {
      return (
        <Alert
          style={STATUS_STYLE}
          type="info"
          message={
            <span>
              <Icon name="edit" /> Editing this license...
            </span>
          }
        />
      );
    }

    const { is_active, why_not } = this.is_active();
    if (is_active) {
      return (
        <Alert
          style={STATUS_STYLE}
          type="success"
          message={
            <span>
              <Icon name="user-check" /> License is currently active and can
              upgrade projects.
            </span>
          }
        />
      );
    } else {
      return (
        <Alert
          style={STATUS_STYLE}
          type="warning"
          message={
            <span>
              <Icon name="user-slash" /> License CANNOT upgrade projects because{" "}
              {why_not}.
            </span>
          }
        />
      );
    }
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
        {this.render_buttons()}
        {this.render_status()}
        {this.render_data()}
        {this.render_projects()}
      </div>
    );
  }
}
