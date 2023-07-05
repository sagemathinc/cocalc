/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Popconfirm, Typography } from "antd";
import { Map } from "immutable";

import { Button, Col, Row } from "@cocalc/frontend/antd-bootstrap";
import { redux } from "@cocalc/frontend/app-framework";
import {
  HelpIcon,
  Icon,
  SettingBox,
  Gap,
  TimeAgo,
} from "@cocalc/frontend/components";
import { cmp } from "@cocalc/util/misc";
import { FIX_BORDER } from "../../project/page/common";

interface SSHKeyListProps {
  ssh_keys?: Map<string, any>;
  project_id?: string;
  help?: JSX.Element;
  children?: any;
  mode?: "project" | "flyout";
}

// Children are rendered above the list of SSH Keys
// Takes an optional Help string or node to render as a help modal
export const SSHKeyList: React.FC<SSHKeyListProps> = (
  props: SSHKeyListProps
) => {
  const { ssh_keys, project_id, help, children, mode = "project" } = props;
  const isFlyout = mode === "flyout";

  function render_header() {
    return (
      <>
        SSH keys <Gap />
        {help && <HelpIcon title="Using SSH Keys">{help}</HelpIcon>}
      </>
    );
  }

  function render_keys() {
    if (ssh_keys == null || ssh_keys.size == 0) return;
    const v: { date?: Date; fp: string; component: JSX.Element }[] = [];

    ssh_keys?.forEach(
      (ssh_key: Map<string, any>, fingerprint: string): void => {
        if (!ssh_key) {
          return;
        }
        ssh_key = ssh_key.set("fingerprint", fingerprint);
        v.push({
          date: ssh_key.get("last_use_date"),
          fp: fingerprint,
          component: (
            <OneSSHKey
              ssh_key={ssh_key}
              key={fingerprint}
              project_id={project_id}
              mode={mode}
            />
          ),
        });
      }
    );
    // sort in reverse order by last_use_date, then by fingerprint
    v.sort(function (a, b) {
      if (a.date != null && b.date != null) {
        return -cmp(a.date, b.date);
      }
      if (a.date && b.date == null) {
        return -1;
      }
      if (b.date && a.date == null) {
        return +1;
      }
      return cmp(a.fp, b.fp);
    });
    if (isFlyout) {
      return <div>{v.map((x) => x.component)}</div>;
    } else {
      return (
        <SettingBox style={{ marginBottom: "0px" }} show_header={false}>
          {v.map((x) => x.component)}
        </SettingBox>
      );
    }
  }

  function renderBody() {
    return (
      <>
        {children}
        {render_keys()}
      </>
    );
  }

  if (isFlyout) {
    return renderBody();
  } else {
    return (
      <SettingBox title={render_header()} icon={"list-ul"}>
        {renderBody()}
      </SettingBox>
    );
  }
};

interface OneSSHKeyProps {
  ssh_key: Map<string, any>;
  project_id?: string;
  mode?: "project" | "flyout";
}

function OneSSHKey({ ssh_key, project_id, mode = "project" }: OneSSHKeyProps) {
  const isFlyout = mode === "flyout";

  function render_last_use(): JSX.Element {
    const d = ssh_key.get("last_use_date");
    if (d) {
      return (
        <div style={{ color: "#1e7e34" }}>
          Last used <TimeAgo date={new Date(d)} />
        </div>
      );
    } else {
      return <div style={{ color: "#333" }}>Never used</div>;
    }
  }

  function delete_key(): void {
    const fingerprint = ssh_key.get("fingerprint");
    if (project_id) {
      redux.getActions("projects").delete_ssh_key_from_project({
        fingerprint,
        project_id: project_id,
      });
    } else {
      redux.getActions("account").delete_ssh_key(fingerprint);
    }
  }

  const key_style: React.CSSProperties = {
    fontSize: isFlyout ? "24px" : "42px",
    color: ssh_key.get("last_use_date") ? "#1e7e34" : undefined,
  };

  const rowStyle = isFlyout
    ? {
        border: "none",
        padding: "5px 0px 5px 0px",
        marginTop: "5px",
        borderTop: FIX_BORDER,
      }
    : {
        border: "1px solid lightgray",
        padding: "5px",
        marginBottom: "5px",
      };

  return (
    <Row style={rowStyle}>
      <Col md={1} style={{ marginRight: "8px" }}>
        <Icon style={key_style} name="key" />
      </Col>
      <Col md={8}>
        <div style={{ fontWeight: 600 }}>{ssh_key.get("title")}</div>
        <span style={{ fontWeight: 600 }}>Fingerprint: </span>
        <Typography.Text code style={{ fontSize: "80%" }}>
          {ssh_key.get("fingerprint")}
        </Typography.Text>
        <br />
        Added on {new Date(ssh_key.get("creation_date")).toLocaleDateString()}
        {render_last_use()}
      </Col>
      <Col md={2}>
        <Popconfirm
          title={
            <div>
              Are you sure you want to delete this SSH key? <br />
              This CANNOT be undone. <br /> If you want to reuse this key in the
              future, you will have to upload it again.
            </div>
          }
          onConfirm={() => delete_key()}
          okText={"Yes, delete key"}
          cancelText={"Cancel"}
        >
          <Button
            bsStyle="warning"
            bsSize={isFlyout ? "xsmall" : "small"}
            style={{ float: "right" }}
          >
            Delete...
          </Button>
        </Popconfirm>
      </Col>
    </Row>
  );
}
