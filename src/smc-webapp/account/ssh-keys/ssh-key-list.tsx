import { Map } from "immutable";
import { Popconfirm } from "antd";

import { React, redux } from "../../app-framework";
import { HelpIcon, Icon, Space, TimeAgo } from "../../r_misc";
import { cmp } from "smc-util/misc";
import { Panel, Row, Col, Button } from "../../antd-bootstrap";

// Children are rendered above the list of SSH Keys
// Takes an optional Help string or node to render as a help modal
export const SSHKeyList: React.FC<{
  ssh_keys?: Map<string, any>;
  project_id?: string;
  help?: JSX.Element;
  children?: any;
}> = ({ ssh_keys, project_id, help, children }) => {
  function render_header() {
    return (
      <h3>
        <Icon name="list-ul" /> SSH keys <Space />
        {help && <HelpIcon title="Using SSH Keys">{help}</HelpIcon>}
      </h3>
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
    return (
      <Panel style={{ marginBottom: "0px" }}>{v.map((x) => x.component)}</Panel>
    );
  }

  return (
    <Panel header={render_header()}>
      {children}
      {render_keys()}
    </Panel>
  );
};

const OneSSHKey: React.FC<{
  ssh_key: Map<string, any>;
  project_id?: string;
}> = ({ ssh_key, project_id }) => {
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

  function delete_key() : void {
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
    fontSize: "42px",
    color: ssh_key.get("last_use_date") ? "#1e7e34" : undefined,
  };

  return (
    <Row
      style={{
        border: "1px solid lightgray",
        padding: "5px",
        marginBottom: "5px",
      }}
    >
      <Col md={1}>
        <Icon style={key_style} name="key" />
      </Col>
      <Col md={8}>
        <div style={{ fontWeight: 600 }}>{ssh_key.get("title")}</div>
        <span style={{ fontWeight: 600 }}>Fingerprint: </span>
        <code>{ssh_key.get("fingerprint")}</code>
        <br />
        Added on {new Date(ssh_key.get("creation_date")).toLocaleDateString()}
        {render_last_use()}
      </Col>
      <Col md={3}>
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
          <Button bsStyle="warning" bsSize="small" style={{ float: "right" }}>
            Delete...
          </Button>
        </Popconfirm>
      </Col>
    </Row>
  );
};
