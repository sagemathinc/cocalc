/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as React from "react";
import { replace } from "lodash";
import { Icon } from "../../r_misc";
import { redux } from "../../app-framework";

import { Project } from "./types";

import { SSHKeyAdder } from "../../account/ssh-keys/ssh-key-adder";
import { SSHKeyList } from "../../account/ssh-keys/ssh-key-list";

interface Props {
  project: Project;
  account_id?: string;
}

export const SSHPanel: React.FC<Props> = React.memo((props: Props) => {
  const { project, account_id } = props;

  const project_id = project.get("project_id");

  function add_ssh_key(opts) {
    opts.project_id = project_id;
    redux.getActions("projects").add_ssh_key_to_project(opts);
  }

  function render_ssh_notice() {
    const user = replace(project_id, /-/g, "");
    const addr = `${user}@ssh.cocalc.com`;
    return (
      <div>
        <span>Use the following username@host:</span>
        <pre>{addr}</pre>
        <a
          href="https://github.com/sagemathinc/cocalc/wiki/AllAboutProjects#create-ssh-key"
          target="_blank"
          rel="noopener"
        >
          <Icon name="life-ring" /> How to create SSH keys
        </a>
      </div>
    );
  }

  if (account_id == null) return null;
  const ssh_keys = project.getIn(["users", account_id, "ssh_keys"]);

  return (
    <div>
      <SSHKeyList ssh_keys={ssh_keys} project_id={project_id}>
        <div>
          <span>
            NOTE: If you want to use the same ssh key for all your projects, add
            a key using the "SSH keys" tab under Account Settings. If you have
            done that, there is no need to configure an ssh key here.
          </span>
        </div>
        <SSHKeyAdder
          add_ssh_key={add_ssh_key}
          toggleable={true}
          style={{ marginBottom: "10px" }}
        />
        {render_ssh_notice()}
      </SSHKeyList>
    </div>
  );
});
