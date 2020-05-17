/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as React from "react";
import { analytics_event } from "../../tracker";
import * as misc from "smc-util/misc";
import { Icon } from "../../r_misc";
import { redux } from "../../app-framework";

import { Project } from "./types";
import { UserMap } from "smc-webapp/todo-types";
import { webapp_client } from "../../webapp-client";

const { SSHKeyAdder } = require("../../widget-ssh-keys/main");
import { SSHKeyList } from "../../account/ssh-keys/ssh-key-list";

interface Props {
  project: Project;
  user_map: UserMap;
  account_id?: string;
}

export class SSHPanel extends React.Component<Props> {
  add_ssh_key = (opts) => {
    opts.project_id = this.props.project.get("project_id");
    redux.getActions("projects").add_ssh_key_to_project(opts);
    analytics_event("project_settings", "add project ssh key");
  };

  delete_ssh_key = (fingerprint) => {
    redux.getActions("projects").delete_ssh_key_from_project({
      fingerprint,
      project_id: this.props.project.get("project_id"),
    });
    analytics_event("project_settings", "remove project ssh key");
  };

  render_ssh_notice() {
    const user = misc.replace_all(
      this.props.project.get("project_id"),
      "-",
      ""
    );
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

  render() {
    const ssh_keys = this.props.project.getIn([
      "users",
      webapp_client.account_id as string,
      "ssh_keys",
    ]);
    return (
      <div>
        <SSHKeyList
          ssh_keys={ssh_keys}
          project_id={this.props.project.get("project_id")}
        >
          <div>
            <span>
              NOTE: If you want to use the same ssh key for all your projects,
              add a key using the "SSH keys" tab under Account Settings. If you
              have done that, there is no need to configure an ssh key here.
            </span>
          </div>
          <SSHKeyAdder
            add_ssh_key={this.add_ssh_key}
            toggleable={true}
            style={{ marginBottom: "10px" }}
            account_id={this.props.account_id}
          />
          {this.render_ssh_notice()}
        </SSHKeyList>
      </div>
    );
  }
}
