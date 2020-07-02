/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Input box for setting the account creation token.
*/

import { List } from "immutable";
import * as moment from "moment";
import { range, sortBy } from "lodash";
import { cmp_moment } from "smc-util/misc2";
import { round1 } from "smc-util/misc";
import { React, Rendered, redux, TypedMap } from "../app-framework";
import {
  Form,
  DatePicker,
  InputNumber,
  Button as AntdButton,
  Input,
  Popconfirm,
  Table,
} from "antd";
import { DeleteOutlined, EditOutlined } from "@ant-design/icons";
import { ErrorDisplay, Saving, COLORS, Icon } from "../r_misc";
import { PassportStrategy } from "../account/passport-types";
import { query } from "../frame-editors/generic/client";
//import { deep_copy } from "smc-util/misc2";

const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

interface Token {
  key?: string; // used in the table, not for the database
  token: string;
  descr?: string;
  limit?: number;
  counter?: number; // readonly
  expires?: moment.Moment; // DB uses Date objects, watch out!
}

interface Props {}

export const AccountCreationToken: React.FC<Props> = () => {
  const [data, set_data] = React.useState<{ [key: string]: Token }>({});
  const [editing, set_editing] = React.useState<Token | null>(null);
  const [saving, set_saving] = React.useState<boolean>(false);
  const [deleting, set_deleting] = React.useState<boolean>(false);
  const [loading, set_loading] = React.useState<boolean>(false);
  const [last_saved, set_last_saved] = React.useState<Token | null>(null);
  const [error, set_error] = React.useState<string>("");
  const [show, set_show] = React.useState<boolean>(false);
  const [sel_rows, set_sel_rows] = React.useState<any>([]);

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
          account_tokens: {
            token: "*",
            descr: null,
            expires: null,
            limit: null,
            disabled: null,
          },
        },
      });
      const data = {};
      for (const x of result.query.account_tokens) {
        if (x.expires) x.expires = moment(x.expires);
        data[x.token] = x;
      }
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
      set_loading(true);
      try {
        load();
      } finally {
        set_loading(false);
      }
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
  }, [editing]);

  // saving a specific token value converts moment.js back to pure Date objects
  // we also record the last saved token as a template for the next add operation
  async function save(val): Promise<void> {
    // antd wraps the time in a moment.js object
    const val_orig: Token = { ...val };
    set_editing(null);
    if (val.expires != null && moment.isMoment(val.expires)) {
      // https://momentjs.com/docs/#/displaying/as-javascript-date/
      val.expires = moment(val.expires).toDate();
    }
    // set optional field to undefined (to get rid of it)
    ["descr", "limit", "expires"].forEach(
      (k) => (val[k] = val[k] ?? undefined)
    );
    try {
      set_saving(true);
      await query({
        query: {
          account_tokens: val,
        },
      });
      // we need the original one, without moment-js in it!
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
          account_tokens: { token },
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
    const one_char = () =>
      chars.charAt(Math.floor(Math.random() * chars.length));
    while (true) {
      const new_token = range(16).map(one_char).join("");
      if (data == null || data[new_token] == null) {
        return new_token;
      }
    }
  }

  function edit_new_token(): void {
    set_editing({ ...last_saved, ...{ token: new_random_token() } });
  }

  function render_edit(): Rendered {
    if (last_saved != null) set_last_saved(null);

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
          <InputNumber min={0} step={1} />
        </Form.Item>
        <Form.Item {...tailLayout}>
          <AntdButton type="primary" htmlType="submit">
            Save
          </AntdButton>
          <AntdButton
            htmlType="button"
            onClick={() => {
              form.resetFields();
              edit_new_token();
            }}
          >
            Reset
          </AntdButton>
          <AntdButton htmlType="button" onClick={() => set_editing(null)}>
            Cancel
          </AntdButton>
          <AntdButton type="link" htmlType="button" onClick={onRandom}>
            Randomize
          </AntdButton>
        </Form.Item>
      </Form>
    );
  }

  function render_buttons() {
    const any_selected = sel_rows.length > 0;
    return (
      <div style={{ margin: "10px 0" }}>
        <AntdButton
          type={!any_selected ? "primary" : "default"}
          disabled={any_selected}
          onClick={() => edit_new_token()}
        >
          Add
        </AntdButton>

        <AntdButton
          type={any_selected ? "primary" : "default"}
          onClick={delete_tokens}
          disabled={!any_selected}
          loading={deleting}
        >
          {any_selected ? `Delete ${sel_rows.length} token(s)` : "Delete"}
        </AntdButton>

        <AntdButton onClick={() => load()}>Refresh</AntdButton>
        <AntdButton onClick={() => set_show(false)}>Close</AntdButton>
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
            title="Usages"
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
            sorter={(a, b) => cmp_moment(a.expires, b.expires)}
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
    if (saving) {
      return <Saving />;
    }
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
      return <div>Account store not defined -- refresh your browser.</div>;
    }
    const strategies:
      | List<TypedMap<PassportStrategy>>
      | undefined = account_store.get("strategies");
    if (strategies == null) {
      // I hit this in production once and it crashed my browser.
      return <div>strategies not loaded -- refresh your browser.</div>;
    }
    if (not_supported(strategies)) {
      return render_unsupported();
    } else {
      return (
        <div>
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
        Account Creation Tokens
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
