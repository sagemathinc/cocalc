/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Manage tokens that can be used to add new users who
know the token to a project.

TODO:
- we don't allow adjusting the limit, so hide that for now.
- the default expire time is "1 week" and user can't edit that yet, except to set expire to now.

*/

import { Button, Table } from "antd";
import { React, useState, useIsMountedRef } from "../app-framework";
import { Icon, Loading, TimeAgo } from "../r_misc";
import { ProjectInviteToken } from "smc-util/db-schema/project-invite-tokens";
import { webapp_client } from "../webapp-client";
import { alert_message } from "../alerts";
import { secure_random_token } from "smc-util/misc2";
import { server_weeks_ago } from "smc-util/misc";

const TOKEN_LIMIT = 200;
const COLUMNS = [
  { title: "Token", dataIndex: "token", key: "token" },
  { title: "Created", dataIndex: "created", key: "created" },
  { title: "Uses", dataIndex: "counter", key: "counter" },
  /* { title: "Limit", dataIndex: "limit", key: "limit" },*/
  { title: "Expires", dataIndex: "expires", key: "expires" },
  { title: "", dataIndex: "expire", key: "expire" },
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

    async function fetch_tokens() {
      try {
        const { query } = await webapp_client.async_query({
          query: {
            project_invite_tokens: [
              {
                project_id,
                token: null,
                created: null,
                expires: null,
                limit: null,
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
      if (tokens != null && tokens.length > TOKEN_LIMIT) {
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
      const token = secure_random_token();
      try {
        await webapp_client.async_query({
          query: {
            project_invite_tokens: {
              token,
              project_id,
              created: webapp_client.server_time(),
              expires: server_weeks_ago(-1),
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
      return <Button onClick={add_token}>Create</Button>;
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

    function render_expire_token(token, expires) {
      if (expires && expires <= webapp_client.server_time()) {
        return "(expired)";
      }
      return <Button onClick={() => expire_token(token)}>Expire</Button>;
    }

    function render_link(token: string) {
      return <pre>https://cocalc.com?project={token}</pre>;
    }

    function render_tokens() {
      if (tokens == null) return <Loading />;
      const dataSource: any[] = [];
      for (const { token, counter, limit, created, expires } of tokens) {
        dataSource.push({
          key: token,
          token: token,
          counter: counter ?? 0,
          limit: limit ?? "∞",
          created: created ? <TimeAgo date={created} /> : undefined,
          expires: expires ? <TimeAgo date={expires} /> : undefined,
          expire: render_expire_token(token, expires),
          link: render_link(token),
        });
      }
      return (
        <Table
          dataSource={dataSource}
          columns={COLUMNS}
          expandable={{
            expandedRowRender: ({ token }) => (
              <div style={{ margin: 0 }}>{render_link(token)}</div>
            ),
          }}
        />
      );
    }

    return (
      <div>
        {heading}
        <br />
        {render_create_token()}
        {render_tokens()}
      </div>
    );
  }
);
