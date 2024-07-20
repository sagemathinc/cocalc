/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Component, Rendered } from "@cocalc/frontend/app-framework";
import { Button, Popconfirm } from "antd";
import { Icon, ErrorDisplay } from "@cocalc/frontend/components";
import { webapp_client } from "../../webapp-client";

interface Props {
  account_id: string;
  banned?: boolean;
  name?: string;
}

interface State {
  error?: string;
  running: boolean;
  link?: string;
  banned: boolean;
}

export class Ban extends Component<Props, State> {
  mounted: boolean = true;

  constructor(props: any) {
    super(props);
    this.state = { running: false, banned: !!props.banned };
  }

  componentWillUnmount(): void {
    this.mounted = false;
  }

  async do_request(): Promise<void> {
    this.setState({ running: true });
    try {
      await webapp_client.admin_client.admin_ban_user(
        this.props.account_id,
        !this.state.banned,
      );
      this.setState({ running: false, banned: !this.state.banned });
    } catch (err) {
      if (!this.mounted) return;
      this.setState({ error: `${err}`, running: false });
    }
  }

  render_ban_button(): Rendered {
    if (this.state.banned) {
      return (
        <Button
          onClick={() => {
            this.do_request();
          }}
          disabled={this.state.running}
        >
          <Icon
            name={this.state.running ? "sync" : "lock-open"}
            spin={this.state.running}
          />{" "}
          Remove Ban on User
        </Button>
      );
    }
    return (
      <Popconfirm
        title={<>Ban "{this.props.name}"?</>}
        description={
          <div style={{ width: "400px" }}>
            {this.props.name} won't be able to login, all API access is revoked,
            auth_tokens are deleted, can't connect to projects, and all ability
            to spend money is immeediately halted. This means{" "}
            <b>
              any compute servers they are running will be completely deleted.
            </b>{" "}
            Use this on spammers and credit card fraudsters. Before they refresh
            their browser, they will just feel likely CoCalc is slow/broken, but
            they won't know why.
          </div>
        }
        okText="Yes, BAN THEM"
        cancelText="No"
        onConfirm={() => {
          this.do_request();
        }}
      >
        <Button disabled={this.state.running}>
          <Icon
            name={this.state.running ? "sync" : "lock-open"}
            spin={this.state.running}
          />{" "}
          Ban User...
        </Button>
      </Popconfirm>
    );
  }

  render_error(): Rendered {
    if (!this.state.error) {
      return;
    }
    return (
      <ErrorDisplay
        error={this.state.error}
        onClose={() => {
          this.setState({ error: undefined });
        }}
      />
    );
  }

  render(): Rendered {
    return (
      <div>
        <b>
          User is currently{" "}
          {this.state.banned
            ? "banned!"
            : "NOT banned:  If you ban them, they lose access to their account.  You can easily remove the ban, but any pay as you go purchases are halted, so compute servers they own will be immediately deleted!"}
        </b>
        <br />
        <br />
        {this.render_error()}
        {this.render_ban_button()}
        <br />
        <br />
      </div>
    );
  }
}
