/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Typography } from "antd";
import SSHKeyList from "@cocalc/frontend/account/ssh-keys/ssh-key-list";
import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { A, Icon } from "@cocalc/frontend/components";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { Project } from "./types";
import CopyToClipBoard from "@cocalc/frontend/components/copy-to-clipboard";

const { Text, Paragraph } = Typography;

interface Props {
  project: Project;
  account_id?: string;
  mode?: "project" | "flyout";
}

export function SSHPanel({ project, mode = "project" }: Props) {
  const ssh_gateway_dns = useTypedRedux("customize", "ssh_gateway_dns");
  const ssh_gateway_fingerprint = useTypedRedux(
    "customize",
    "ssh_gateway_fingerprint",
  );

  const project_id = project.get("project_id");

  function render_fingerprint() {
    // we ignore empty strings as well
    if (!ssh_gateway_fingerprint) return;
    return (
      <Paragraph>
        The server's fingerprint is: <Text code>{ssh_gateway_fingerprint}</Text>
        .
      </Paragraph>
    );
  }

  function render_ssh_notice() {
    const text = `${project_id}@${ssh_gateway_dns}`;
    return (
      <>
        <hr />
        <Paragraph>
          Use <Text code>{project_id}</Text> as the username to connect:
        </Paragraph>
        <Paragraph>
          <CopyToClipBoard
            style={{
              textAlign: "center",
            }}
            value={text}
            inputStyle={{ margin: "auto" }}
          />
        </Paragraph>
        {render_fingerprint()}
        <Paragraph>
          <A href="https://doc.cocalc.com/account/ssh.html">
            <Icon name="life-ring" /> Docs...
          </A>
        </Paragraph>
      </>
    );
  }

  const ssh_keys = project.getIn([
    "users",
    webapp_client.account_id as string,
    "ssh_keys",
  ]);

  return (
    <SSHKeyList
      ssh_keys={ssh_keys}
      project_id={project.get("project_id")}
      mode={mode}
    >
      <>
        <p>
          To SSH to your project add your public key below, or{" "}
          <Button
            type="link"
            onClick={() => {
              redux
                .getProjectActions(project.get("project_id"))
                .open_file({ path: ".ssh/authorized_keys" });
            }}
          >
            add your key to ~/.ssh/authorized_keys
          </Button>
        </p>
        <p>
          The project <Text strong>must be running</Text> in order to connect
          via ssh. It is not necessary to restart the project after you add or
          remove a key.
        </p>
      </>
      {render_ssh_notice()}
    </SSHKeyList>
  );
}
