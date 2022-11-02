/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { SSHKeyAdder } from "@cocalc/frontend/account/ssh-keys/ssh-key-adder";
import { SSHKeyList } from "@cocalc/frontend/account/ssh-keys/ssh-key-list";
import { React, redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { A, Icon } from "@cocalc/frontend/components";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { replace } from "lodash";
import { Project } from "./types";
import { Typography } from "antd";

const { Text, Paragraph } = Typography;

interface Props {
  project: Project;
  account_id?: string;
}

export const SSHPanel: React.FC<Props> = React.memo((props: Props) => {
  const { project } = props;

  const ssh_gateway_dns = useTypedRedux("customize", "ssh_gateway_dns");

  const project_id = project.get("project_id");

  function add_ssh_key(opts) {
    opts.project_id = project_id;
    redux.getActions("projects").add_ssh_key_to_project(opts);
  }

  function render_ssh_notice() {
    const user = replace(project_id, /-/g, "");
    const text = `${user}@${ssh_gateway_dns}`;
    return (
      <>
        <hr />
        <Paragraph>
          Use the following <Text code>username@host</Text> to connect to this
          project:
        </Paragraph>
        <Paragraph
          copyable={{ text }}
          style={{
            whiteSpace: "nowrap",
            overflowX: "auto",
            textAlign: "center",
          }}
        >
          <Text strong code>
            {text}
          </Text>
        </Paragraph>
        <Paragraph>
          <A href="https://github.com/sagemathinc/cocalc/wiki/AllAboutProjects#create-ssh-key">
            <Icon name="life-ring" /> How to create SSH keys
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
    <SSHKeyList ssh_keys={ssh_keys} project_id={project.get("project_id")}>
      <>
        <p>
          Easily access this project directly via SSH by adding an ssh public
          key here.
        </p>
        <p>
          The project <Text strong>must be running</Text> in order to be able to
          connect and any changes take <Text strong>about 30 seconds</Text> to
          take effect.
        </p>
      </>
      <SSHKeyAdder
        add_ssh_key={add_ssh_key}
        toggleable={true}
        style={{ marginBottom: "10px" }}
        extra={
          <p>
            If you want to use the same SSH key for all your projects, add it
            using the "SSH keys" tab under Account Settings. If you have done
            that, there is no need to also configure an SSH key here.
          </p>
        }
      />
      {render_ssh_notice()}
    </SSHKeyList>
  );
});
