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
import { React, Rendered, redux, TypedMap } from "../app-framework";
import { Button } from "../antd-bootstrap";
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
import { ErrorDisplay, Saving, COLORS } from "../r_misc";
import { PassportStrategy } from "../account/passport-types";
import { query } from "../frame-editors/generic/client";
//import { deep_copy } from "smc-util/misc2";

const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

interface Token {
  key?: string; // used in the table, not for the database
  token: string;
  desc?: string;
  limit?: number;
  counter?: number; // readonly
  expires?: moment.Moment; // DB uses Date objects, watch out!
}

interface Props {}

type States = "save" | "load" | "add" | "view" | "edit" | "closed";

export const AccountCreationToken: React.FC<Props> = () => {
  const [state, set_state] = React.useState<States>("closed");
  const [data, set_data] = React.useState<{ [key: string]: Token }>({});
  const [editing, set_editing] = React.useState<Token | null>(null);
  const [last_saved, set_last_saved] = React.useState<Token | null>(null);
  const [error, set_error] = React.useState<string>("");
  const [show, set_show] = React.useState<boolean>(false);
  const [sel_rows, set_sel_rows] = React.useState<any>([]);
  const [deleting, set_deleting] = React.useState<boolean>(false);

  const [form] = Form.useForm();

  async function load() {
    let result: any;
    try {
      // TODO query should be limited by disabled != true
      result = await query({
        query: {
          account_tokens: [
            {
              token: null,
              desc: null,
              expires: null,
              counter: null,
              limit: null,
              disabled: null,
            },
          ],
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
    }
  }

  React.useEffect(() => {
    // every time we show or hide, clear the selection
    set_sel_rows([]);
    if (show) {
      set_state("load");
      try {
        load();
      } finally {
        set_state("view");
      }
    }
  }, [show]);

  async function save(val): Promise<void> {
    // antd wraps the time in a moment.js object
    if (val.expires != null && moment.isMoment(val.expires)) {
      // https://momentjs.com/docs/#/displaying/as-javascript-date/
      val.expires = moment(val.expires).toDate();
    }
    try {
      set_show(false);
      await query({
        query: {
          account_tokens: val,
        },
      });
      set_last_saved(val);
      set_editing(null);
      set_show(true);
    } catch (err) {
      set_error(err);
    }
  }

  async function delete_tokens(): Promise<void> {
    set_deleting(true);
    try {
      await query({
        query: {
          account_tokens: sel_rows.map((token) => {
            return { token };
          }),
        },
        options: [{ delete: true }],
      });
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
    const layout = {
      style: { margin: "20px 0" },
      labelCol: { span: 2 },
      wrapperCol: { span: 8 },
    };

    const tailLayout = {
      wrapperCol: { offset: 2, span: 8 },
    };

    const onFinish = (values) => {
      save(values);
    };

    const onRandom = () => form.setFieldsValue({ token: new_random_token() });

    // antd's form want's something called "Store", but this works fine, though.
    form.setFieldsValue(editing as any);

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
          name="desc"
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
    const any_selected = sel_rows.length > 0;
    return (
      <>
        <div style={{ margin: "10px 0" }}>
          <AntdButton
            type="primary"
            onClick={delete_tokens}
            disabled={!any_selected}
            loading={deleting}
          >
            Delete
          </AntdButton>
          <span style={{ marginLeft: 8 }}>
            {any_selected ? `Delete ${sel_rows.length} token(s)` : ""}
          </span>
        </div>

        <Table<Token>
          size={"small"}
          dataSource={table_data}
          rowSelection={rowSelection}
          pagination={{ position: ["bottomRight"] }}
          rowClassName={(row) =>
            row.token === last_saved?.token ? "cocalc-bg-highlight" : ""
          }
        >
          <Table.Column<Token>
            title="Token"
            dataIndex="token"
            defaultSortOrder={"ascend"}
            sorter={(a, b) => a.token.localeCompare(b.token)}
          />
          <Table.Column<Token> title="Description" dataIndex="desc" />
          <Table.Column<Token>
            title="Usages"
            dataIndex="counter"
            render={(text) => text ?? 0}
          />
          <Table.Column<Token> title="Limit" dataIndex="limit" />
          <Table.Column<Token>
            title="% Used"
            dataIndex="used"
            render={(_text, token) => {
              if (token.limit != null) {
                return `${(100 * (token.counter ?? 0)) / token.limit} %`;
              } else {
                return "";
              }
            }}
          />
          <Table.Column<Token>
            title="Expires"
            dataIndex="expires"
            defaultSortOrder={"ascend"}
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
                onConfirm={() => console.log("DELETE", token.key)}
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

  function render_buttons(): Rendered {
    return (
      <div>
        <Button onClick={() => edit_new_token()}>Add</Button>
        <Button onClick={() => set_show(false)}>Close</Button>
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
      const buttons = render_buttons();
      return (
        <div>
          {state == "save" && <Saving />}
          {buttons}
          {render_error()}
          {render_control()}
          {render_info()}
          {buttons}
        </div>
      );
    }
  }

  function render_body() {
    if (!show) {
      return <Button onClick={() => set_show(true)}>Load tokens ...</Button>;
    } else {
      return render_content();
    }
  }

  return (
    <div>
      <h4>Account Creation Tokens</h4>
      {render_body()}
    </div>
  );
};
