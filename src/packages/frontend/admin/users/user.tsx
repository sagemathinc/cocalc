/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Display of basic information about a user, with link to get more information about that user.
*/

import { Icon, TimeAgo } from "@cocalc/frontend/components";
import { Component, Rendered } from "@cocalc/frontend/app-framework";
import { capitalize } from "@cocalc/util/misc";
import { Card, Space, Tag } from "antd";
import { User } from "@cocalc/frontend/frame-editors/generic/client";
import { Projects } from "./projects";
import { Impersonate } from "./impersonate";
import { PasswordReset } from "./password-reset";
import { Ban } from "./ban";
import PayAsYouGoMinBalance from "@cocalc/frontend/frame-editors/crm-editor/users/pay-as-you-go-min-balance";
import { PurchasesButton } from "@cocalc/frontend/purchases/purchases";
import { CopyToClipBoard } from "@cocalc/frontend/components";
import Money from "./money";

interface State {
  projects: boolean;
  purchases: boolean;
  activity: boolean;
  impersonate: boolean;
  password: boolean;
  ban: boolean;
}

interface HeaderProps {
  header: true;
  first_name: string;
  last_name: string;
  email_address: string;
  created: string;
  last_active: string;
  account_id: string;
  banned?: undefined;
}

interface UserProps extends User {
  header?: false;
}

type Props = HeaderProps | UserProps;

type More =
  | "projects"
  | "purchases"
  | "activity"
  | "impersonate"
  | "password"
  | "ban";

const MORE: More[] = [
  "projects",
  "purchases",
  "activity",
  "impersonate",
  "password",
  "ban",
];

export class UserResult extends Component<Props, State> {
  constructor(props, state) {
    super(props, state);
    const x: any = {};
    for (const name of MORE) {
      x[name] = false;
    }
    this.state = x as State;
  }

  render_created(): Rendered {
    if (!this.props.created) {
      return <span>ancient times</span>;
    }
    return <TimeAgo date={this.props.created} />;
  }

  render_last_active(): Rendered {
    if (!this.props.last_active) {
      return <span>never</span>;
    }
    return <TimeAgo date={this.props.last_active} />;
  }

  render_purchases(): Rendered {
    if (!this.state.purchases) {
      return;
    }
    return (
      <Card title="Purchases">
        <div style={{ margin: "15px 0" }}>
          <Money account_id={this.props.account_id} />
          <div style={{ height: "15px" }} />
          <PayAsYouGoMinBalance account_id={this.props.account_id} />
          <div style={{ height: "15px" }} />
          <PurchasesButton account_id={this.props.account_id} />
        </div>
      </Card>
    );
  }

  render_projects(): Rendered {
    if (!this.state.projects) {
      return;
    }
    return (
      <Projects
        account_id={this.props.account_id}
        title={`Recently active projects that ${this.props.first_name} ${this.props.last_name} collaborates on`}
      />
    );
  }

  render_impersonate(): Rendered {
    if (!this.state.impersonate) {
      return;
    }
    return (
      <Impersonate
        account_id={this.props.account_id}
        first_name={this.props.first_name ?? ""}
        last_name={this.props.last_name ?? ""}
      />
    );
  }

  render_password(): Rendered {
    if (!this.state.password) {
      return;
    }
    return (
      <Card title="Password">
        <PasswordReset email_address={this.props.email_address} />
      </Card>
    );
  }

  render_ban(): Rendered {
    if (!this.state.ban) {
      return;
    }
    return (
      <Card
        title={
          <>
            Ban {this.props.first_name} {this.props.last_name}{" "}
            {this.props.email_address}
          </>
        }
      >
        <Ban
          account_id={this.props.account_id}
          banned={this.props.banned}
          name={`${this.props.first_name} ${this.props.last_name} ${this.props.email_address}`}
        />
      </Card>
    );
  }

  render_caret(show: boolean): Rendered {
    if (show) {
      return <Icon name="caret-down" />;
    } else {
      return <Icon name="caret-right" />;
    }
  }

  render_more_link(name: More): Rendered {
    // sorry about the any below; I could NOT get typescript to work.
    return (
      <Tag.CheckableTag
        checked={this.state[name]}
        onChange={() => (this as any).setState({ [name]: !this.state[name] })}
      >
        {capitalize(name)}
      </Tag.CheckableTag>
    );
  }

  render_more_links(): Rendered {
    return (
      <Space style={{ marginTop: "5px" }}>
        {this.render_more_link("projects")}
        {this.render_more_link("purchases")}
        {this.render_more_link("impersonate")}
        {this.render_more_link("password")}
        {this.render_more_link("ban")}
      </Space>
    );
  }

  render_banned(): Rendered {
    if (!this.props.banned) return;
    return (
      <div
        style={{
          fontSize: "10pt",
          color: "white",
          paddingLeft: "5px",
          background: "red",
        }}
      >
        BANNED
      </div>
    );
  }

  render(): Rendered {
    return (
      <Card
        style={{ margin: "15px 0", background: "#fafafa" }}
        styles={{
          body: { padding: "0 24px" },
          title: { padding: "0" },
        }}
        title={
          <div>
            <div style={{ float: "right", color: "#666" }}>
              Active {this.render_last_active()} (Created{" "}
              {this.render_created()})
            </div>
            <Space style={{ color: "#666" }}>
              {this.props.first_name} {this.props.last_name}{" "}
              {this.props.email_address ? (
                <CopyToClipBoard
                  value={this.props.email_address}
                  inputStyle={{ color: "#666" }}
                />
              ) : (
                "NO Email"
              )}
            </Space>
          </div>
        }
      >
        <div style={{ float: "right" }}>
          <CopyToClipBoard
            inputStyle={{ color: "#666" }}
            before
            value={this.props.account_id}
          />
          {this.render_banned()}
        </div>
        {this.render_more_links()}
        {this.render_impersonate()}
        {this.render_password()}
        {this.render_ban()}
        {this.render_projects()}
        {this.render_purchases()}
      </Card>
    );
  }
}
