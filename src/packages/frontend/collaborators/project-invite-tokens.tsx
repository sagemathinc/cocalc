/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Manage tokens that can be used to add new users who
know the token to a project.

TODO:
- we don't allow adjusting the usage_limit, so hide that for now.
- the default expire time is "2 weeks" and user can't edit that yet, except to set expire to now.

*/

// Load the code that checks for the PROJECT_INVITE_QUERY_PARAM
// when user gets signed in, and handles it.

import { Button, Card, DatePicker, Form, Modal, Popconfirm, Table } from "antd";
import dayjs from "dayjs";
import { join } from "path";

import { alert_message } from "@cocalc/frontend/alerts";
import {
  React,
  useIsMountedRef,
  useState,
} from "@cocalc/frontend/app-framework";
import {
  CopyToClipBoard,
  Gap,
  Icon,
  Loading,
  TimeAgo,
} from "@cocalc/frontend/components";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { CancelText } from "@cocalc/frontend/i18n/components";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { ProjectInviteToken } from "@cocalc/util/db-schema/project-invite-tokens";
import { secure_random_token, server_weeks_ago } from "@cocalc/util/misc";
import { PROJECT_INVITE_QUERY_PARAM } from "./handle-project-invite";

const { useForm } = Form;

const TOKEN_LENGTH = 16;
const MAX_TOKENS = 200;
const COLUMNS = [
  { title: "Invite Link", dataIndex: "token", key: "token", width: 300 },
  { title: "Created", dataIndex: "created", key: "created", width: 150 },
  { title: "Expires", dataIndex: "expires", key: "expires", width: 150 },
  { title: "Redemption Count", dataIndex: "counter", key: "counter" },
  /* { title: "Limit", dataIndex: "usage_limit", key: "usage_limit" },*/
];

interface Props {
  project_id: string;
}

export const ProjectInviteTokens: React.FC<Props> = React.memo(
  ({ project_id }) => {
    // blah
    const [expanded, set_expanded] = useState<boolean>(false);
    const [tokens, set_tokens] = useState<undefined | ProjectInviteToken[]>(
      undefined,
    );
    const is_mounted_ref = useIsMountedRef();
    const [fetching, set_fetching] = useState<boolean>(false);
    const [addModalVisible, setAddModalVisible] = useState<boolean>(false);
    const [form] = useForm();

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
      <div>
        <a
          onClick={() => {
            if (!expanded) {
              fetch_tokens();
            }
            set_expanded(!expanded);
          }}
          style={{ cursor: "pointer", fontSize: "12pt" }}
        >
          {" "}
          <Icon
            style={{ width: "20px" }}
            name={expanded ? "caret-down" : "caret-right"}
          />{" "}
          Invite collaborators by sending them an invite URL...
        </a>
      </div>
    );
    if (!expanded) {
      return heading;
    }

    async function add_token(expires: Date) {
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
              expires,
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

    async function add_token_two_week() {
      let expires = server_weeks_ago(-2);
      add_token(expires);
    }

    function render_create_token() {
      return (
        <Popconfirm
          title={
            "Create a link that people can use to get added as a collaborator to this project."
          }
          onConfirm={add_token_two_week}
          okText={"Yes, create token"}
          cancelText={<CancelText />}
        >
          <Button disabled={fetching}>
            <Icon name="plus-circle" />
            <Gap /> Create two weeks token
          </Button>
        </Popconfirm>
      );
    }
    const handleAdd = () => {
      setAddModalVisible(true);
    };

    const handleModalOK = () => {
      // const name = form.getFieldValue("name");
      const expire = form.getFieldValue("expire");
      add_token(expire.toDate());
      setAddModalVisible(false);
      form.resetFields();
    };

    const handleModalCancel = () => {
      setAddModalVisible(false);
      form.resetFields();
    };

    function render_create_custom_token() {
      return (
        <Button onClick={handleAdd}>
          <Icon name="plus-circle" /> Create custom token
        </Button>
      );
    }

    function render_refresh() {
      return (
        <Button onClick={fetch_tokens} disabled={fetching}>
          <Icon name="refresh" spin={fetching} />
          <Gap /> Refresh
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
        return "(REVOKED)";
      }
      return (
        <Popconfirm
          title={"Revoke this token?"}
          description={
            <div style={{ maxWidth: "400px" }}>
              This will make it so this token cannot be used anymore. Anybody
              who has already redeemed the token is not removed from this
              project.
            </div>
          }
          onConfirm={() => expire_token(token)}
          okText={"Yes, revoke this token"}
          cancelText={"Cancel"}
        >
          <Button size="small">Revoke...</Button>
        </Popconfirm>
      );
    }

    function render_tokens() {
      if (tokens == null) return <Loading />;
      const dataSource: any[] = [];
      for (const data of tokens) {
        const { token, counter, usage_limit, created, expires } = data;
        dataSource.push({
          key: token,
          token:
            expires && expires <= webapp_client.server_time() ? (
              <span style={{ textDecoration: "line-through" }}>{token}</span>
            ) : (
              <CopyToClipBoard
                inputWidth="250px"
                value={`${document.location.origin}${join(
                  appBasePath,
                  "app",
                )}?${PROJECT_INVITE_QUERY_PARAM}=${token}`}
              />
            ),
          counter,
          usage_limit: usage_limit ?? "∞",
          created: created ? <TimeAgo date={created} /> : undefined,
          expires: expires ? (
            <span>
              <TimeAgo date={expires} /> <Gap />
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
        />
      );
    }

    return (
      <Card style={{ minWidth: "800px", width: "100%", overflow: "auto" }}>
        {heading}
        <br />
        <br />
        {render_create_token()}
        <Gap />
        {render_create_custom_token()}
        <Gap />
        {render_refresh()}
        <br />
        <br />
        {render_tokens()}
        <br />
        <br />
        <Modal
          open={addModalVisible}
          title="Create a New Inviting Token"
          okText="Create token"
          cancelText={<CancelText />}
          onCancel={handleModalCancel}
          onOk={handleModalOK}
        >
          <Form form={form} layout="vertical">
            <Form.Item
              name="expire"
              label="Expire"
              rules={[
                {
                  required: false,
                  message:
                    "Optional date when token will be automatically expired",
                },
              ]}
            >
              <DatePicker
                changeOnBlur
                showTime
                disabledDate={(current) => {
                  // disable all dates before today
                  return current && current < dayjs();
                }}
              />
            </Form.Item>
          </Form>
        </Modal>
      </Card>
    );
  },
);
