/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Projects } from "@cocalc/frontend/admin/users/projects";
import { Button, Checkbox } from "@cocalc/frontend/antd-bootstrap";
import { CSS, Rendered, TypedMap } from "@cocalc/frontend/app-framework";
import {
  A,
  CopyToClipBoard,
  DateTimePicker,
  Icon,
  Space,
  TimeAgo,
} from "@cocalc/frontend/components";
import {
  capitalize,
  days_ago,
  hours_ago,
  is_date,
  merge,
  months_ago,
  plural,
  replace_all,
  weeks_ago,
} from "@cocalc/util/misc";
import { SiteLicense } from "@cocalc/util/types/site-licenses";
import { Alert, Col, Row } from "antd";
import jsonic from "jsonic";
import { DebounceInput } from "react-debounce-input";
import { actions } from "./actions";
import { Managers } from "./managers";
import { DisplayQuota, EditQuota } from "./quota";
import { license_fields, license_field_type, ManagerInfo } from "./types";
import {
  DisplayUpgrades,
  EditUpgrades,
  scale_by_display_factors,
} from "./upgrades";

const BACKGROUNDS = ["white", "#f8f8f8"];

interface Props {
  editing?: boolean;
  edits?: TypedMap<SiteLicense>;
  license: TypedMap<SiteLicense>;
  manager_info?: ManagerInfo;
  saving?: boolean;
  show_projects?: Date | "now";
  usage_stats?: number; // for now this is just the number of projects running right now with the license; later it might have hourly/daily/weekly, active, etc.
}

function format_as_label(field: string): string {
  // Some replacements that look better.
  if (field == "info") {
    field = "Structured JSON information";
  }
  return replace_all(capitalize(field), "_", " ");
}

const STATUS_STYLE: CSS = {
  display: "inline-block",
  marginBottom: "5px",
} as const;

export const INPUT_STYLE: CSS = {
  border: "1px solid lightgrey",
  borderRadius: "3px",
  padding: "0 5px",
} as const;

export const License: React.FC<Props> = (props: Props) => {
  const {
    editing,
    edits,
    license,
    manager_info,
    saving,
    show_projects,
    usage_stats,
  } = props;

  function render_data(): Rendered[] {
    const v: Rendered[] = [];
    let i = 0;
    for (const field in license_fields) {
      let val;
      if (editing && edits != null && edits.has(field)) {
        val = edits.get(field);
      } else {
        val = license.get(field);
        if (val != null && field == "upgrades") {
          // tedious detail: some upgrades have to be scaled before displaying to be edited...
          val = scale_by_display_factors(val);
        }
      }
      const backgroundColor = BACKGROUNDS[i % 2];
      i += 1;
      let x = render_value(field, val);
      if (field == "id" && typeof x == "string") {
        x = (
          <CopyToClipBoard
            value={x}
            style={{ display: "inline-block", width: "50ex", margin: 0 }}
          />
        );
      }
      v.push(
        <Row
          key={field}
          style={{
            borderBottom: "1px solid lightgrey",
            backgroundColor,
            padding: editing ? "5px 0" : undefined,
          }}
        >
          <Col span={4}>{format_as_label(field)}</Col>
          <Col span={20}>{x}</Col>
        </Row>
      );
    }
    return v;
  }

  function on_change(field, new_val): void {
    actions.set_edit(license.get("id"), field, new_val);
  }

  function render_value(field, val): Rendered | string {
    let x: Rendered | string = undefined;
    const type: license_field_type = license_fields[field];
    if (editing) {
      const onChange = (new_val) => on_change(field, new_val);
      switch (type) {
        case "string":
          x = (
            <DebounceInput
              style={merge({ width: "50ex" }, INPUT_STYLE)}
              value={val != null ? val : ""}
              onChange={(e) => onChange((e.target as any).value)}
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
              onChange={(e) => onChange((e.target as any).value)}
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
          x = (
            <Managers
              managers={val}
              license_id={license.get("id")}
              manager_info={manager_info}
            />
          );
          break;
        case "boolean":
          x = (
            <Checkbox
              checked={!!val}
              onChange={(e) => onChange((e.target as any).checked)}
            />
          );
          break;
        case "upgrades":
          x = (
            <EditUpgrades
              upgrades={val}
              license_id={license.get("id")}
              license_field={field}
            />
          );
          break;
        case "quota":
          x = (
            <EditQuota
              quota={val}
              license_id={license.get("id")}
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
                onChange={(e) => onChange((e.target as any).value)}
              />{" "}
              (0 = no limit)
            </span>
          );
          break;
        case "map":
          let value: string = "";
          if (val) {
            if (typeof val != "string") {
              value = JSON.stringify(val, undefined, 2);
            } else {
              value = val;
            }
          }
          x = (
            <div>
              <DebounceInput
                element="textarea"
                forceNotifyByEnter={false}
                placeholder={
                  '{"invoice_id":"some-structured-JSON-data", "stripe_id": "more-data"}'
                }
                style={merge({ width: "100%" }, INPUT_STYLE)}
                rows={4}
                value={value}
                onChange={(e) => onChange((e.target as any).value)}
                onBlur={() => {
                  try {
                    onChange(JSON.stringify(jsonic(value), undefined, 2));
                  } catch (_err) {
                    // This just means jsonic can't transform it to valid json.
                  }
                }}
              />
              <br />
              Input forgivingly parsed using{" "}
              <A href="https://github.com/rjrodger/jsonic/blob/master/README.md">
                jsonic
              </A>
              ; deleting fields is not implemented.
            </div>
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
                background: val ? undefined : "yellow",
              }}
            >
              {val ? val : "Enter a description"}
            </div>
          );
          break;
        case "string":
          x = (
            <div
              style={{
                whiteSpace: "pre",
                background: val ? undefined : "yellow",
              }}
            >
              {val ? val : "Enter a title"}
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
                  <Icon name="warning" /> Never expires -- set an expiration
                  date
                </span>
              );
            } else if (val <= new Date()) {
              x = (
                <span
                  style={{
                    background: "darkred",
                    color: "white",
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
                    color: "white",
                  }}
                >
                  <Icon name="warning" /> Never actives -- set an activation
                  date!
                </div>
              );
            } else if (val > new Date()) {
              x = (
                <div
                  style={{
                    background: "darkred",
                    color: "white",
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
        case "account_id[]":
          x = (
            <Managers
              managers={val}
              license_id={license.get("id")}
              manager_info={manager_info}
            />
          );
          break;
        case "upgrades":
          x = <DisplayUpgrades upgrades={val} />;
          break;
        case "quota":
          x = <DisplayQuota quota={val} />;
          break;
        case "map":
          if (!val) {
            x = "";
          } else {
            x = (
              <pre style={{ margin: 0, padding: "5px" }}>
                {JSON.stringify(val, undefined, 2)}
              </pre>
            );
          }
          break;
        default:
          x = `${val}`;
      }
      if (field == "run_limit" && !val) {
        x = (
          <div
            style={{
              background: "yellow",
            }}
          >
            <Icon name="warning" /> No limit -- set a limit
          </div>
        );
      }
    }

    if (field == "run_limit") {
      x = (
        <Row>
          <Col md={8}>{x}</Col>
          <Col md={16}>{render_usage_stats(val)}</Col>
        </Row>
      );
    }

    return x;
  }

  function render_show_projects_title(): Rendered {
    if (!show_projects) return <span />;
    if (show_projects == "now")
      return <span>Currently running projects upgraded with this license</span>;
    return (
      <span>
        Projects that ran upgraded with this license since{" "}
        <TimeAgo date={show_projects} />
      </span>
    );
  }

  function render_projects(): Rendered {
    if (!show_projects) return;
    return (
      <div style={{ marginTop: "30px" }}>
        <Button
          style={{ float: "right", margin: "5px" }}
          onClick={() => actions.hide_projects(license.get("id"))}
        >
          Close
        </Button>
        <Projects
          license_id={license.get("id")}
          title={render_show_projects_title()}
          cutoff={show_projects}
        />
      </div>
    );
  }

  function render_usage_stats(run_limit): Rendered {
    const style: React.CSSProperties = { fontStyle: "italic" };
    if (run_limit && usage_stats && usage_stats >= run_limit) {
      // hitting the limit -- make it clearer!
      style.color = "red";
      style.fontWeight = "bold";
    }
    return (
      <div style={{ marginLeft: "5px" }}>
        <span style={style}>
          {usage_stats ?? 0} running {plural(usage_stats, "project")} currently
          using this license.
        </span>
        <br />
        Projects using license:{" "}
        <a onClick={() => actions.show_projects(license.get("id"), "now")}>
          now
        </a>
        ; during the last{" "}
        <a
          onClick={() => actions.show_projects(license.get("id"), hours_ago(1))}
        >
          hour
        </a>
        ,{" "}
        <a
          onClick={() => actions.show_projects(license.get("id"), days_ago(1))}
        >
          {" "}
          day
        </a>
        ,{" "}
        <a
          onClick={() => actions.show_projects(license.get("id"), weeks_ago(1))}
        >
          week
        </a>{" "}
        or{" "}
        <a
          onClick={() =>
            actions.show_projects(license.get("id"), months_ago(1))
          }
        >
          month
        </a>
      </div>
    );
  }

  function render_buttons(): Rendered {
    let buttons;
    const id = license.get("id");
    if (editing) {
      buttons = (
        <>
          <Button onClick={() => actions.cancel_editing(id)} disabled={saving}>
            Cancel
          </Button>
          <Space />
          <Button
            disabled={edits == null || edits.size <= 1 || saving}
            bsStyle="success"
            onClick={() => actions.save_editing(id)}
          >
            <Icon name={"save"} /> {saving ? "Saving..." : "Save"}
          </Button>
        </>
      );
    } else {
      buttons = <Button onClick={() => actions.start_editing(id)}>Edit</Button>;
    }
    return <div style={{ float: "right" }}>{buttons}</div>;
  }

  function check_is_active(): { is_active: boolean; why_not?: string } {
    // Is it active?
    const activates = license.get("activates");
    if (!activates)
      return { is_active: false, why_not: "no activation date set" };
    if (activates > new Date())
      return { is_active: false, why_not: "it has not yet become activated" };
    // Has it expired?
    const expires = license.get("expires");
    if (expires && expires <= new Date())
      return { is_active: false, why_not: "it has expired" };
    // Any actual upgrades?
    const upgrades = license.get("upgrades");
    if (upgrades != null) {
      for (let [field, val] of upgrades) {
        field = field; // typescript
        if (val) return { is_active: true }; // actual upgrade, so yes is having an impact.
      }
    }
    const quota = license.get("quota");
    if (quota != null) {
      for (let [field, val] of quota) {
        field = field; // typescript
        if (val) return { is_active: true }; // actual quota, so yes is having an impact.
      }
    }
    return { is_active: false, why_not: "no upgrades are configured" };
  }

  // Show a message explaining whether -- with the current saved settings --
  // this license will upgrade any projects.  Only shown in view mode, to
  // avoid potentional confusion in edit mode.
  function render_status(): Rendered {
    if (editing) {
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

    const { is_active, why_not } = check_is_active();
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

  return (
    <div
      style={{
        border: "1px solid lightgrey",
        borderRadius: "5px",
        padding: "10px",
      }}
    >
      {render_buttons()}
      {render_status()}
      {render_data()}
      {render_projects()}
    </div>
  );
};
