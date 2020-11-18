/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*

Editing a quota

 - shows user rows for cpu, ram, disk, member, and always_running: optional
 - they can edit all the rows.
 - optional: also shows rows for support and network that can't be edited

*/

import { Button, Checkbox, InputNumber, Row, Col } from "antd";
import { A, Space } from "../../r_misc";
import { CSS, React, useMemo, useState } from "../../app-framework";
import { Quota } from "smc-util/db-schema/site-licenses";
import { COSTS, GCE_COSTS, money } from "./util";
import { plural } from "smc-util/misc2";
import { round1 } from "smc-util/misc";

const ROW_STYLE: CSS = {
  border: "1px solid #eee",
  padding: "5px",
  margin: "5px",
  borderRadius: "3px",
} as const;

const UNIT_STYLE: CSS = {
  padding: "0 5px",
  fontWeight: 400,
} as const;

function render_explanation(s): JSX.Element {
  return (
    <span style={{ color: "#888" }}>
      <Space /> - {s}
    </span>
  );
}

interface Props {
  quota: Quota;
  onChange: (change: Quota) => void;
  hideExtra?: boolean; // hide extra boxes, etc. -- this is used for admin editing, where they know what is up.
  disabled?: boolean;
  show_advanced_default?: boolean; // if the "advanced" part should pop up by default
}

export const QuotaEditor: React.FC<Props> = ({
  quota,
  onChange,
  hideExtra,
  disabled,
  show_advanced_default,
}) => {
  const [show_advanced, set_show_advanced] = useState<boolean>(
    show_advanced_default ?? false
  );
  const hosting_multiplier = useMemo(() => {
    return (
      (quota.member ? COSTS.custom_cost.member : 1) *
      (quota.always_running ? COSTS.custom_cost.always_running : 1) *
      (quota.member && quota.always_running ? GCE_COSTS.non_pre_factor : 1)
    );
  }, [quota]);

  const col = hideExtra
    ? { control: 18, max: 6 }
    : { control: 8, max: 3, desc: 16 };

  function user(): "academic" | "business" {
    if (quota.user == null) {
      throw Error("quota.user must be set");
    }
    return quota.user;
  }

  function render_cpu() {
    return (
      <Row style={ROW_STYLE}>
        <Col md={col.control - col.max}>
          <InputNumber
            disabled={disabled}
            min={COSTS.basic.cpu}
            max={COSTS.custom_max.cpu}
            value={quota.cpu}
            onChange={(x) => {
              if (typeof x != "number") return;
              onChange({ cpu: Math.round(x) });
            }}
          />
          <Space />
          <span style={UNIT_STYLE}>shared CPU {plural(quota.cpu, "core")}</span>
        </Col>
        <Col md={col.max}>
          <Button
            disabled={quota.cpu == COSTS.custom_max.cpu}
            onClick={() => onChange({ cpu: COSTS.custom_max.cpu })}
          >
            Max
          </Button>
        </Col>
        {!hideExtra && (
          <Col md={col.desc}>
            <b>
              shared CPU cores (
              {`${money(
                COSTS.user_discount[user()] *
                  COSTS.custom_cost.cpu *
                  hosting_multiplier
              )}/CPU cores per month per project`}
              )
            </b>
            {render_explanation(
              "Google cloud vCPU's shared with other projects (member hosting significantly reduces sharing)"
            )}
          </Col>
        )}
      </Row>
    );
  }

  function render_ram() {
    return (
      <Row style={ROW_STYLE}>
        <Col md={col.control - col.max}>
          <InputNumber
            disabled={disabled}
            min={COSTS.basic.ram}
            max={COSTS.custom_max.ram}
            value={quota.ram}
            onChange={(x) => {
              if (typeof x != "number") return;
              onChange({ ram: Math.round(x) });
            }}
          />
          <Space />
          <span style={UNIT_STYLE}>shared GB RAM</span>
        </Col>
        <Col md={col.max}>
          <Button
            disabled={quota.ram == COSTS.custom_max.ram}
            onClick={() => onChange({ ram: COSTS.custom_max.ram })}
          >
            Max
          </Button>
        </Col>
        {!hideExtra && (
          <Col md={col.desc}>
            <b>
              GB RAM (
              {`${money(
                COSTS.user_discount[user()] *
                  COSTS.custom_cost.ram *
                  hosting_multiplier
              )}/GB RAM per month per project`}
              )
            </b>
            {render_explanation("RAM may be shared with other users")}
          </Col>
        )}
      </Row>
    );
  }

  function render_dedicated_cpu() {
    return (
      <Row style={ROW_STYLE}>
        <Col md={col.control - col.max}>
          <InputNumber
            disabled={disabled}
            min={COSTS.basic.dedicated_cpu}
            max={COSTS.custom_max.dedicated_cpu}
            value={quota.dedicated_cpu}
            onChange={(x) => {
              if (typeof x != "number") return;
              onChange({ dedicated_cpu: round1(x) });
            }}
          />
          <Space />
          <span style={UNIT_STYLE}>
            dedicated CPU {plural(quota.dedicated_cpu, "core")}
          </span>
        </Col>
        <Col md={col.max}>
          <Button
            disabled={quota.dedicated_cpu == COSTS.custom_max.dedicated_cpu}
            onClick={() =>
              onChange({ dedicated_cpu: COSTS.custom_max.dedicated_cpu })
            }
          >
            Max
          </Button>
        </Col>
        {!hideExtra && (
          <Col md={col.desc}>
            <b>
              dedicated CPU cores (
              {`${money(
                COSTS.user_discount[user()] *
                  COSTS.custom_cost.dedicated_cpu *
                  hosting_multiplier
              )}/CPU cores per month per project`}
              )
            </b>
            {render_explanation(
              "Google cloud vCPU's NOT shared with other projects.  You can enter a fractional value, e.g., 0.5 for a half dedicated core."
            )}
          </Col>
        )}
      </Row>
    );
  }

  function render_dedicated_ram() {
    return (
      <Row style={ROW_STYLE}>
        <Col md={col.control - col.max}>
          <InputNumber
            disabled={disabled}
            min={COSTS.basic.dedicated_ram}
            max={COSTS.custom_max.dedicated_ram}
            value={quota.dedicated_ram}
            onChange={(x) => {
              if (typeof x != "number") return;
              onChange({ dedicated_ram: Math.round(x) });
            }}
          />
          <Space />
          <span style={UNIT_STYLE}>dedicated GB RAM</span>
        </Col>
        <Col md={col.max}>
          <Button
            disabled={quota.dedicated_ram == COSTS.custom_max.dedicated_ram}
            onClick={() =>
              onChange({ dedicated_ram: COSTS.custom_max.dedicated_ram })
            }
          >
            Max
          </Button>
        </Col>
        {!hideExtra && (
          <Col md={col.desc}>
            <b>
              dedicated GB RAM (
              {`${money(
                COSTS.user_discount[user()] *
                  COSTS.custom_cost.dedicated_ram *
                  hosting_multiplier
              )}/GB RAM per month per project`}
              )
            </b>
            {render_explanation("RAM is not shared with other users")}
          </Col>
        )}
      </Row>
    );
  }

  function render_disk() {
    return (
      <Row style={ROW_STYLE}>
        <Col md={col.control - col.max}>
          <InputNumber
            disabled={disabled}
            min={COSTS.basic.disk}
            max={COSTS.custom_max.disk}
            value={quota.disk}
            onChange={(x) => {
              if (typeof x != "number") return;
              onChange({ disk: Math.round(x) });
            }}
          />
          <Space />
          <span style={UNIT_STYLE}>GB disk space</span>
        </Col>
        <Col md={col.max}>
          <Button
            disabled={quota.disk == COSTS.custom_max.disk}
            onClick={() => onChange({ disk: COSTS.custom_max.disk })}
          >
            Max
          </Button>
        </Col>
        {!hideExtra && (
          <Col md={col.desc}>
            <b>
              GB Disk Space (
              {`${money(
                COSTS.user_discount[user()] * COSTS.custom_cost.disk
              )}/GB disk per month per project`}
              )
            </b>
            {render_explanation(
              "store a larger number of files. Snapshots and file edit history is included at no additional charge."
            )}
          </Col>
        )}
      </Row>
    );
  }

  function render_member() {
    return (
      <Row style={ROW_STYLE}>
        <Col md={col.control}>
          <Checkbox
            checked={quota.member}
            onChange={(e) => onChange({ member: e.target.checked })}
            disabled={disabled}
          >
            Member hosting
          </Checkbox>
        </Col>
        {!hideExtra && (
          <Col md={col.desc}>
            member hosting{" "}
            <b>(multiplies RAM/CPU price by {COSTS.custom_cost.member})</b>
            {render_explanation(
              "project runs on computers with far fewer other projects.  If not selected your project runs on very, very heavily loaded trial servers, which might be OK depending on your application."
            )}
          </Col>
        )}
      </Row>
    );
  }

  function render_always_running() {
    return (
      <Row style={ROW_STYLE}>
        <Col md={col.control}>
          <Checkbox
            checked={quota.always_running}
            onChange={(e) => onChange({ always_running: e.target.checked })}
            disabled={disabled}
          >
            Always running
          </Checkbox>
        </Col>
        {!hideExtra && (
          <Col md={col.desc}>
            project is always running{" "}
            <b>
              (multiplies RAM/CPU price by{" "}
              {COSTS.custom_cost.always_running * GCE_COSTS.non_pre_factor} for
              member hosting or multiply by {COSTS.custom_cost.always_running}{" "}
              without)
            </b>{" "}
            {render_explanation(
              "run long computations and never have to wait for project to start.  Without this, project will stop  if it is not actively being used." +
                (!quota.member
                  ? " Because member hosting isn't selected, project will restart at least once daily."
                  : "")
            )}{" "}
            See{" "}
            <A href="https://doc.cocalc.com/project-init.html">
              project init scripts.
            </A>{" "}
            (Note: this is NOT guaranteed 100% uptime, since projects may
            sometimes restart for security and maintenance reasons.)
          </Col>
        )}
      </Row>
    );
  }

  function render_support() {
    return (
      <Row style={ROW_STYLE}>
        <Col md={col.control}>
          <Checkbox checked={true} disabled={true}>
            <span style={disabled ? undefined : { color: "rgba(0,0,0,.65)" }}>
              Priority support
            </span>
          </Checkbox>
        </Col>
        {!hideExtra && (
          <Col md={col.desc}>
            priority support
            {render_explanation(
              "we prioritize your support requests much higher (included with all licensed projects)"
            )}
          </Col>
        )}
      </Row>
    );
  }

  function render_network() {
    return (
      <Row style={ROW_STYLE}>
        <Col md={col.control}>
          <Checkbox checked={true} disabled={true}>
            <span style={disabled ? undefined : { color: "rgba(0,0,0,.65)" }}>
              Network access
            </span>
          </Checkbox>
        </Col>
        {!hideExtra && (
          <Col md={col.desc}>
            network access
            {render_explanation(
              "project can connect to the Internet to clone git repositories, download files, send emails, etc.  (included with all licensed projects)"
            )}
          </Col>
        )}
      </Row>
    );
  }

  function render_show_advanced_link() {
    if (show_advanced) {
      return (
        <a
          style={{ marginLeft: "5px", fontSize: "12pt" }}
          onClick={() => set_show_advanced(false)}
        >
          Hide advanced options
        </a>
      );
    } else
      return (
        <a
          style={{ marginLeft: "5px", fontSize: "12pt" }}
          onClick={() => set_show_advanced(true)}
        >
          Show advanced options...
        </a>
      );
  }

  function render_dedicated() {
    return (
      <div style={ROW_STYLE}>
        We also offer <b>dedicated virtual machines</b>, which are usually a
        much better value than always running dedicated cpu's. Request a quote
        below and explain that you're interested in a dedicated VM.
      </div>
    );
  }

  return (
    <div>
      {render_cpu()}
      {render_ram()}
      {render_disk()}
      {!hideExtra && render_support()}
      {!hideExtra && render_network()}
      {render_show_advanced_link()}
      {show_advanced && render_member()}
      {show_advanced && render_always_running()}
      {show_advanced && render_dedicated_cpu()}
      {show_advanced && render_dedicated_ram()}
      {show_advanced && !hideExtra && render_dedicated()}
    </div>
  );
  //
};
