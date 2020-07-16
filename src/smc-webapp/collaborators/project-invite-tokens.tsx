/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Manage tokens that can be used to add new users who
know the token to a project.

TODO:
- we don't allow adjusting the usage_limit, so hide that for now.
- the default expire time is "2 weeks" and user can't edit that yet, except to set expire to now.

*/

import { Button, Popconfirm, Table } from "antd";
import { React, useState, useIsMountedRef } from "../app-framework";
import { CopyToClipBoard, Icon, Loading, Space, TimeAgo } from "../r_misc";
import { ProjectInviteToken } from "smc-util/db-schema/project-invite-tokens";
import { webapp_client } from "../webapp-client";
import { alert_message } from "../alerts";
import { secure_random_token } from "smc-util/misc2";
import { server_weeks_ago } from "smc-util/misc";

const TOKEN_LENGTH = 16;
const MAX_TOKENS = 200;
const COLUMNS = [
  { title: "Token", dataIndex: "token", key: "token" },
  { title: "Created", dataIndex: "created", key: "created" },
  { title: "Uses", dataIndex: "counter", key: "counter" },
  /* { title: "Limit", dataIndex: "usage_limit", key: "usage_limit" },*/
  { title: "Expires", dataIndex: "expires", key: "expires" },
];

interface Props {
  project_id: string;
}

export const ProjectInviteTokens: React.FC<Props> = React.memo(
  ({ project_id }) => {
    // blah
    const [expanded, set_expanded] = useState<boolean>(false);
    const [tokens, set_tokens] = useState<undefined | ProjectInviteToken[]>(
      undefined
    );
    const is_mounted_ref = useIsMountedRef();
    const [fetching, set_fetching] = useState<boolean>(false);

    async function fetch_tokens() {
      try {
        set_fetching(true);
        const { query } = await webapp_client.async_query({
          query: {
            project_invite_tokens: [
              {
                project_id,
                token: null,
                created: null,
                expires: null,
                usage_limit: null,
                counter: null,
              },
            ],
          },
        });
        if (!is_mounted_ref.current) return;
        set_tokens(query.project_invite_tokens);
      } catch (err) {
        alert_message({
          type: "error",
          message: `Error getting project invite tokens: ${err}`,
        });
      } finally {
        if (is_mounted_ref.current) {
          set_fetching(false);
        }
      }
    }

    const heading = (
      <a
        onClick={() => {
          if (!expanded) {
            fetch_tokens();
          }
          set_expanded(!expanded);
        }}
        style={{ cursor: "pointer" }}
      >
        {" "}
        <Icon
          style={{ width: "20px" }}
          name={expanded ? "caret-down" : "caret-right"}
        />{" "}
        Or invite people via a link...
      </a>
    );
    if (!expanded) {
      return heading;
    }

    async function add_token() {
      if (tokens != null && tokens.length > MAX_TOKENS) {
        // TODO: just in case of some weird abuse... and until we implement
        // deletion of tokens.  Maybe the backend will just purge
        // anything that has expired after a while.
        alert_message({
          type: "error",
          message:
            "You have hit the hard limit on the number of invite tokens for a single project. Please contact support.",
        });
        return;
      }
      const token = secure_random_token(TOKEN_LENGTH);
      try {
        await webapp_client.async_query({
          query: {
            project_invite_tokens: {
              token,
              project_id,
              created: webapp_client.server_time(),
              expires: server_weeks_ago(-2),
            },
          },
        });
      } catch (err) {
        alert_message({
          type: "error",
          message: `Error creating project invite token: ${err}`,
        });
      }
      if (!is_mounted_ref.current) return;
      fetch_tokens();
    }

    function render_create_token() {
      return (
        <Popconfirm
          title={
            "Create a link that people can use to get added as a collaborator to this project."
          }
          onConfirm={add_token}
          okText={"Yes, create token"}
          cancelText={"Cancel"}
        >
          <Button disabled={fetching}>
            <Icon name="plus" />
            <Space /> Create token...
          </Button>
        </Popconfirm>
      );
    }

    function render_refresh() {
      return (
        <Button onClick={fetch_tokens} disabled={fetching}>
          <Icon name="refresh" spin={fetching} />
          <Space /> Refresh
        </Button>
      );
    }

    async function expire_token(token) {
      // set token to be expired
      try {
        await webapp_client.async_query({
          query: {
            project_invite_tokens: {
              token,
              project_id,
              expires: webapp_client.server_time(),
            },
          },
        });
      } catch (err) {
        alert_message({
          type: "error",
          message: `Error expiring project invite token: ${err}`,
        });
      }
      if (!is_mounted_ref.current) return;
      fetch_tokens();
    }

    function render_expire_button(token, expires) {
      if (expires && expires <= webapp_client.server_time()) {
        return "(EXPIRED)";
      }
      return (
        <Popconfirm
          title={
            "Expire this token?  This will make it so this token cannot be used anymore."
          }
          onConfirm={() => expire_token(token)}
          okText={"Yes, expire token"}
          cancelText={"Cancel"}
        >
          <Button>Expire...</Button>
        </Popconfirm>
      );
    }

    function render_link(data: ProjectInviteToken) {
      const { token, expires } = data;
      if (expires && expires <= webapp_client.server_time()) {
        return <div>This token is expired.</div>;
      }
      return (
        <div>
          Make this link available to people who you would like to join this
          project:
          <br />
          <br />
          <CopyToClipBoard
            value={`${document.location.origin}${window.app_base_url}/app?project_invite=${token}`}
            style={{ width: "100%" }}
          />
        </div>
      );
    }

    function render_tokens() {
      if (tokens == null) return <Loading />;
      const dataSource: any[] = [];
      for (const data of tokens) {
        const { token, counter, usage_limit, created, expires } = data;
        dataSource.push({
          key: token,
          token: token,
          counter,
          usage_limit: usage_limit ?? "∞",
          created: created ? <TimeAgo date={created} /> : undefined,
          expires: expires ? (
            <span>
              <TimeAgo date={expires} /> <Space />
              {render_expire_button(token, expires)}
            </span>
          ) : undefined,
          data,
        });
      }
      return (
        <Table
          dataSource={dataSource}
          columns={COLUMNS}
          pagination={{ pageSize: 4 }}
          scroll={{ y: 240 }}
          expandable={{
            expandedRowRender: ({ data }) => {
              return <div style={{ margin: 0 }}>{render_link(data)}</div>;
            },
          }}
        />
      );
    }

    return (
      <div>
        {heading}
        <br />
        <br />
        {render_create_token()}
        <Space />
        {render_refresh()}
        <br />
        <br />
        {render_tokens()}
      </div>
    );
  }
);
