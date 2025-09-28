/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Flex, Popconfirm, Typography } from "antd";
import { Map } from "immutable";
import { useIntl } from "react-intl";
import { redux } from "@cocalc/frontend/app-framework";
import {
  Gap,
  HelpIcon,
  Icon,
  SettingBox,
  //TimeAgo,
} from "@cocalc/frontend/components";
import { labels } from "@cocalc/frontend/i18n";
import { CancelText } from "@cocalc/frontend/i18n/components";
import { cmp } from "@cocalc/util/misc";
import SSHKeyAdder from "./ssh-key-adder";
import { CopyToClipBoard } from "@cocalc/frontend/components";

interface SSHKeyListProps {
  ssh_keys?: Map<string, any>;
  project_id?: string;
  help?: React.JSX.Element;
  children?: any;
  mode?: "project" | "flyout";
}

// Children are rendered above the list of SSH Keys
// Takes an optional Help string or node to render as a help modal
export default function SSHKeyList({
  ssh_keys,
  project_id,
  help,
  children,
  mode = "project",
}: SSHKeyListProps) {
  const intl = useIntl();
  const isFlyout = mode === "flyout";

  function renderAdder(size?) {
    if (project_id) {
      return (
        <SSHKeyAdder
          size={size}
          add_ssh_key={(opts) => {
            redux
              .getActions("projects")
              .add_ssh_key_to_project({ ...opts, project_id });
          }}
          style={{ marginBottom: "10px" }}
          extra={
            <p>
              If you want to use the same SSH key for all your projects and
              compute servers, add it using the "SSH Keys" tab under Account
              Settings. If you have done that, there is no need to also
              configure an SSH key here.
            </p>
          }
        />
      );
    } else {
      return (
        <SSHKeyAdder
          size={size}
          add_ssh_key={(opts) => redux.getActions("account").add_ssh_key(opts)}
          style={{ marginBottom: "0px" }}
        />
      );
    }
  }

  function render_header() {
    return (
      <Flex style={{ width: "100%" }}>
        {project_id ? "Project " : ""}
        {intl.formatMessage(labels.ssh_keys)} <Gap />
        {help && <HelpIcon title="Using SSH Keys">{help}</HelpIcon>}
        <div style={{ flex: 1 }} />
        {(ssh_keys?.size ?? 0) > 0 ? (
          <div style={{ float: "right" }}>{renderAdder()}</div>
        ) : undefined}
      </Flex>
    );
  }

  function render_keys() {
    if (ssh_keys == null || ssh_keys.size == 0) {
      return <div style={{ textAlign: "center" }}>{renderAdder("large")}</div>;
    }
    const v: { date?: Date; fp: string; component: React.JSX.Element }[] = [];

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
      },
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
}

interface OneSSHKeyProps {
  ssh_key: Map<string, any>;
  project_id?: string;
  mode?: "project" | "flyout";
}

function OneSSHKey({ ssh_key, project_id, mode = "project" }: OneSSHKeyProps) {
  const isFlyout = mode === "flyout";

  //   function render_last_use(): React.JSX.Element {
  //     const d = ssh_key.get("last_use_date");
  //     if (d) {
  //       return (
  //         <span style={{ color: "#1e7e34" }}>
  //           Last used <TimeAgo date={new Date(d)} />
  //         </span>
  //       );
  //     } else {
  //       return <span style={{ color: "#333" }}>Never used</span>;
  //     }
  //   }

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
    fontSize: isFlyout ? "42px" : "72px",
    color: ssh_key.get("last_use_date") ? "#1e7e34" : "#888",
  };

  return (
    <div
      style={{
        display: "flex",
        borderBottom: "1px solid #ccc",
        padding: "15px",
      }}
    >
      <div style={{ width: isFlyout ? "48px" : "100px", display: "flex" }}>
        <Icon style={key_style} name="key" />
      </div>
      <div style={{ flex: 1 }}>
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
          cancelText={<CancelText />}
        >
          <Button
            type="link"
            size={isFlyout ? "small" : "middle"}
            style={{ float: "right" }}
          >
            <Icon name="trash" /> Delete...
          </Button>
        </Popconfirm>
        <div style={{ fontWeight: 600 }}>{ssh_key.get("title")}</div>
        <span style={{ fontWeight: 600 }}>Fingerprint: </span>
        <Typography.Text code style={{ fontSize: "80%" }}>
          {ssh_key.get("fingerprint")}
        </Typography.Text>
        <br />
        <CopyToClipBoard
          size="small"
          inputWidth="400px"
          value={ssh_key.get("value")}
          style={{ width: "100%", margin: "5px 0" }}
        />
        Added on {new Date(ssh_key.get("creation_date")).toLocaleDateString()}
        {/*<div> {render_last_use()} (NOTE: not all usage is tracked.)</div>*/}
      </div>
    </div>
  );
}
