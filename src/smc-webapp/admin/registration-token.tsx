/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Input box for setting the account creation token.
*/

import { List } from "immutable";
import * as moment from "moment";
import { sortBy, pick } from "lodash";
import { cmp_moment, secure_random_token, round1 } from "smc-util/misc";
import { RegistrationTokenSetFields } from "smc-util/db-schema/types";
import { React, Rendered, redux, TypedMap } from "../app-framework";
import {
  Checkbox,
  Form,
  DatePicker,
  InputNumber,
  Input,
  Popconfirm,
  Table,
  Switch,
} from "antd";
import * as antd from "antd";
import { Alert } from "../antd-bootstrap";
import { DeleteOutlined, EditOutlined } from "@ant-design/icons";
import { ErrorDisplay, Saving, Icon } from "../r_misc";
import { COLORS } from "smc-util/theme";
import { PassportStrategy } from "../account/passport-types";
import { query } from "../frame-editors/generic/client";

interface Token {
  key?: string; // used in the table, not for the database
  token: string;
  disabled?: boolean;
  active?: boolean; // active is just !disabled
  descr?: string;
  limit?: number;
  counter?: number; // readonly
  expires?: moment.Moment; // DB uses Date objects, watch out!
}

function use_registration_tokens() {
  const [data, set_data] = React.useState<{ [key: string]: Token }>({});
  const [no_or_all_inactive, set_no_or_all_inactive] =
    React.useState<boolean>(false);
  const [editing, set_editing] = React.useState<Token | null>(null);
  const [saving, set_saving] = React.useState<boolean>(false);
  const [deleting, set_deleting] = React.useState<boolean>(false);
  const [loading, set_loading] = React.useState<boolean>(false);
  const [last_saved, set_last_saved] = React.useState<Token | null>(null);
  const [error, set_error] = React.useState<string>("");
  const [show, set_show] = React.useState<boolean>(false);
  const [sel_rows, set_sel_rows] = React.useState<any>([]);

  // Antd
  const [form] = Form.useForm();

  // we load the data in a map, indexed by the token
  // dates are converted to moment.js on the fly
  async function load() {
    let result: any;
    set_loading(true);
    try {
      // TODO query should be limited by disabled != true
      result = await query({
        query: {
          registration_tokens: {
            token: "*",
            descr: null,
            expires: null,
            limit: null,
            disabled: null,
          },
        },
      });
      const data = {};
      let warn_signup = true;
      for (const x of result.query.registration_tokens) {
        if (x.expires) x.expires = moment(x.expires);
        x.active = !x.disabled;
        data[x.token] = x;
        // we have at least one active token → no need to warn user
        if (x.active) warn_signup = false;
      }
      set_no_or_all_inactive(warn_signup);
      set_error("");
      set_data(data);
    } catch (err) {
      set_error(err.message);
    } finally {
      set_loading(false);
    }
  }

  React.useEffect(() => {
    // every time we show or hide, clear the selection
    set_sel_rows([]);
    if (show) {
      load();
    } else {
      // reset state upon closing
      set_sel_rows([]);
      set_last_saved(null);
      set_error("");
    }
  }, [show]);

  React.useEffect(() => {
    if (editing != null) {
      // antd's form want's something called "Store" – which is just this?
      form.setFieldsValue(editing as any);
    }
    if (last_saved != null) {
      set_last_saved(null);
    }
  }, [editing]);

  // saving a specific token value converts moment.js back to pure Date objects
  // we also record the last saved token as a template for the next add operation
  async function save(val): Promise<void> {
    // antd wraps the time in a moment.js object
    const val_orig: Token = { ...val };
    if (editing != null) set_editing(null);

    // data preparation
    if (val.expires != null && moment.isMoment(val.expires)) {
      // https://momentjs.com/docs/#/displaying/as-javascript-date/
      val.expires = moment(val.expires).toDate();
    }
    val.disabled = !val.active;
    val = pick(val, [
      "token",
      "disabled",
      "expires",
      "limit",
      "descr",
    ] as RegistrationTokenSetFields[]);
    // set optional field to undefined (to get rid of it)
    ["descr", "limit", "expires"].forEach(
      (k: RegistrationTokenSetFields) => (val[k] = val[k] ?? undefined)
    );
    try {
      set_saving(true);
      await query({
        query: {
          registration_tokens: val,
        },
      });
      // we save the original one, with moment-js in it!
      set_last_saved(val_orig);
      set_saving(false);
      await load();
    } catch (err) {
      set_error(err);
      set_editing(val_orig);
    } finally {
      set_saving(false);
    }
  }

  async function delete_token(
    token: string | undefined,
    single: boolean = false
  ) {
    if (token == null) return;
    if (single) set_deleting(true);

    try {
      await query({
        query: {
          registration_tokens: { token },
        },
        options: [{ delete: true }],
      });
      if (single) load();
    } catch (err) {
      if (single) {
        set_error(err);
      } else {
        throw err;
      }
    } finally {
      if (single) set_deleting(false);
    }
  }

  async function delete_tokens(): Promise<void> {
    set_deleting(true);
    try {
      // it's not possible to delete several tokens at once
      await sel_rows.map(async (token) => await delete_token(token));
      set_sel_rows([]);
      load();
    } catch (err) {
      set_error(err);
    } finally {
      set_deleting(false);
    }
  }

  // we generate a random token and make sure it doesn't exist
  // TODO also let the user generate one with a validation check
  function new_random_token(): string {
    return secure_random_token(16);
  }

  function edit_new_token(): void {
    set_editing({
      ...last_saved,
      ...{ token: new_random_token(), active: true },
    });
  }

  return {
    data,
    form,
    editing,
    saving,
    deleting,
    delete_token,
    delete_tokens,
    loading,
    last_saved,
    error,
    set_error,
    show,
    sel_rows,
    set_sel_rows,
    set_deleting,
    set_editing,
    new_random_token,
    edit_new_token,
    save,
    load,
    set_show,
    no_or_all_inactive,
  };
}

export const RegistrationToken: React.FC<{}> = () => {
  // TODO I'm sure this could be done in a smarter way ...
  const {
    show,
    data,
    form,
    set_show,
    error,
    set_error,
    deleting,
    delete_token,
    delete_tokens,
    editing,
    set_editing,
    saving,
    sel_rows,
    set_sel_rows,
    last_saved,
    new_random_token,
    no_or_all_inactive,
    edit_new_token,
    save,
    load,
    loading,
  } = use_registration_tokens();

  function render_edit(): Rendered {
    const layout = {
      style: { margin: "20px 0" },
      labelCol: { span: 2 },
      wrapperCol: { span: 8 },
    };

    const tailLayout = {
      wrapperCol: { offset: 2, span: 8 },
    };

    const onFinish = (values) => save(values);
    const onRandom = () => form.setFieldsValue({ token: new_random_token() });
    const limit_min = editing != null ? editing.counter ?? 0 : 0;

    return (
      <Form
        {...layout}
        size={"middle"}
        form={form}
        name="add-account-token"
        onFinish={onFinish}
      >
        <Form.Item name="token" label="Token" rules={[{ required: true }]}>
          <Input disabled={true} />
        </Form.Item>
        <Form.Item
          name="descr"
          label="Description"
          rules={[{ required: false }]}
        >
          <Input />
        </Form.Item>
        <Form.Item name="expires" label="Expires" rules={[{ required: false }]}>
          <DatePicker />
        </Form.Item>
        <Form.Item name="limit" label="Limit" rules={[{ required: false }]}>
          <InputNumber min={limit_min} step={1} />
        </Form.Item>
        <Form.Item name="active" label="Active" valuePropName="checked">
          <Switch />
        </Form.Item>
        <Form.Item {...tailLayout}>
          <antd.Button type="primary" htmlType="submit">
            Save
          </antd.Button>
          <antd.Button
            htmlType="button"
            onClick={() => {
              form.resetFields();
              edit_new_token();
            }}
          >
            Reset
          </antd.Button>
          <antd.Button htmlType="button" onClick={() => set_editing(null)}>
            Cancel
          </antd.Button>
          <antd.Button type="link" onClick={onRandom}>
            Randomize
          </antd.Button>
        </Form.Item>
      </Form>
    );
  }

  function render_buttons() {
    const any_selected = sel_rows.length > 0;
    return (
      <div style={{ margin: "10px 0" }}>
        <antd.Button
          type={!any_selected ? "primary" : "default"}
          disabled={any_selected}
          onClick={() => edit_new_token()}
        >
          Add
        </antd.Button>

        <antd.Button
          type={any_selected ? "primary" : "default"}
          onClick={delete_tokens}
          disabled={!any_selected}
          loading={deleting}
        >
          {any_selected ? `Delete ${sel_rows.length} token(s)` : "Delete"}
        </antd.Button>

        <antd.Button onClick={() => load()}>Refresh</antd.Button>
        <antd.Button onClick={() => set_show(false)}>Close</antd.Button>
      </div>
    );
  }

  function render_view(): Rendered {
    const table_data = sortBy(
      Object.values(data).map((v) => {
        v.key = v.token;
        return v;
      }),
      "token"
    );
    const rowSelection = {
      selectedRowKeys: sel_rows,
      onChange: set_sel_rows,
    };
    return (
      <>
        {render_buttons()}

        <Table<Token>
          size={"small"}
          dataSource={table_data}
          loading={loading}
          rowSelection={rowSelection}
          pagination={{
            position: ["bottomRight"],
            defaultPageSize: 10,
            showSizeChanger: true,
          }}
          rowClassName={(row) =>
            row.token === last_saved?.token
              ? "cocalc-highlight-saved-token"
              : ""
          }
        >
          <Table.Column<Token>
            title="Token"
            dataIndex="token"
            defaultSortOrder={"ascend"}
            sorter={(a, b) => a.token.localeCompare(b.token)}
          />
          <Table.Column<Token> title="Description" dataIndex="descr" />
          <Table.Column<Token>
            title="Uses"
            dataIndex="counter"
            render={(text) => text ?? 0}
          />
          <Table.Column<Token>
            title="Limit"
            dataIndex="limit"
            render={(text) => (text != null ? text : "∞")}
          />
          <Table.Column<Token>
            title="% Used"
            dataIndex="used"
            render={(_text, token) => {
              const { limit, counter } = token;
              if (limit != null) {
                if (limit == 0) {
                  return "100%";
                } else {
                  // codemirror -_-
                  const c = counter ?? 0;
                  const pct = (100 * c) / limit;
                  return {
                    props: {
                      style: {
                        backgroundColor:
                          pct > 90 ? COLORS.ATND_BG_RED_L : undefined,
                      },
                    },
                    children: `${round1(pct)}%`,
                  };
                }
              } else {
                return "";
              }
            }}
          />
          <Table.Column<Token>
            title="Expires"
            dataIndex="expires"
            sortDirections={["ascend", "descend"]}
            render={(v) => (v != null ? v.fromNow() : "never")}
            sorter={(a, b) => cmp_moment(a.expires, b.expires, true)}
          />

          <Table.Column<Token>
            title="Active"
            dataIndex="disabled"
            render={(_text, token) => {
              const click = () => save({ ...token, active: !token.active });
              return (
                <Checkbox checked={token.active} onChange={click}></Checkbox>
              );
            }}
          />
          <Table.Column<Token>
            title="Edit"
            dataIndex="edit"
            render={(_text, token) => (
              <EditOutlined onClick={() => set_editing(token)} />
            )}
          />
          <Table.Column<Token>
            title="Delete"
            dataIndex="delete"
            render={(_text, token) => (
              <Popconfirm
                title="Sure to delete?"
                onConfirm={() => delete_token(token.key, true)}
              >
                <DeleteOutlined />
              </Popconfirm>
            )}
          />
        </Table>
      </>
    );
  }

  function render_control(): Rendered {
    if (editing != null) {
      return render_edit();
    } else {
      return render_view();
    }
  }

  function render_error(): Rendered {
    if (error) {
      return <ErrorDisplay error={error} onClose={() => set_error("")} />;
    }
  }

  // this tells an admin that users can sign in freely if there are no tokens or no active tokens
  function render_no_active_token_warning(): Rendered {
    if (no_or_all_inactive) {
      return (
        <Alert bsStyle="warning">
          No tokens, or there are no active tokens. This means anybody can use
          your server.
          <br />
          Create at least one active token to prevent just anybody from signing
          up for your server!
        </Alert>
      );
    }
  }

  function render_unsupported(): Rendered {
    // see https://github.com/sagemathinc/cocalc/issues/333
    return (
      <div style={{ color: COLORS.GRAY }}>
        Not supported! At least one "public" passport strategy is enabled.
      </div>
    );
  }

  function render_info(): Rendered {
    return (
      <div style={{ color: COLORS.GRAY, fontStyle: "italic" }}>
        {saving && (
          <>
            <Saving />
            <br />
          </>
        )}
        Note: You can disable email sign up in Site Settings
      </div>
    );
  }

  // disable token editing if any strategy besides email is public
  function not_supported(strategies): boolean {
    return strategies
      .filterNot((s) => s.get("name") === "email")
      .some((s) => s.get("public"));
  }

  function render_content(): Rendered {
    const account_store: any = redux.getStore("account");
    if (account_store == null) {
      return <div>Account store not defined -- try again...</div>;
    }
    const strategies: List<TypedMap<PassportStrategy>> | undefined =
      account_store.get("strategies");
    if (strategies == null) {
      // I hit this in production once and it crashed my browser.
      return <div>strategies not loaded -- try again...</div>;
    }
    if (not_supported(strategies)) {
      return render_unsupported();
    } else {
      return (
        <div>
          {render_no_active_token_warning()}
          {render_error()}
          {render_control()}
          {render_info()}
        </div>
      );
    }
  }

  function render_body(): Rendered {
    if (show) {
      return render_content();
    }
  }

  function render_header(): Rendered {
    return (
      <h4 onClick={() => set_show((v) => !v)} style={{ cursor: "pointer" }}>
        <Icon
          style={{ width: "20px" }}
          name={show ? "caret-down" : "caret-right"}
        />{" "}
        Registration Tokens
      </h4>
    );
  }

  return (
    <div>
      {render_header()}
      {render_body()}
    </div>
  );
};
