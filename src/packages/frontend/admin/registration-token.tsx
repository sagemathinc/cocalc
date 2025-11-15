/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Input box for setting the account creation token.
*/

import {
  Button as AntdButton,
  Checkbox,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Radio,
  Switch,
  Table,
} from "antd";
import type { RadioChangeEvent } from "antd";
import dayjs from "dayjs";
import { List } from "immutable";
import { pick, sortBy } from "lodash";

import { DeleteOutlined, EditOutlined } from "@ant-design/icons";
import { Alert } from "@cocalc/frontend/antd-bootstrap";
import {
  React,
  redux,
  Rendered,
  TypedMap,
} from "@cocalc/frontend/app-framework";
import {
  ErrorDisplay,
  Icon,
  Saving,
  TimeAgo,
} from "@cocalc/frontend/components";
import Copyable from "@cocalc/frontend/components/copy-to-clipboard";
import { query } from "@cocalc/frontend/frame-editors/generic/client";
import { CancelText } from "@cocalc/frontend/i18n/components";
import { RegistrationTokenSetFields } from "@cocalc/util/db-schema/types";
import { cmp_dayjs, round1, secure_random_token } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { PassportStrategyFrontend } from "@cocalc/util/types/passport-types";

interface Token {
  key?: string; // used in the table, not for the database
  token: string;
  disabled?: boolean;
  active?: boolean; // active is just !disabled
  descr?: string;
  limit?: number;
  counter?: number; // readonly
  expires?: dayjs.Dayjs; // DB uses Date objects, watch out!
  ephemeral?: number;
}

const HOUR_MS = 60 * 60 * 1000;
const EPHEMERAL_PRESETS = [
  { key: "6h", label: "6 hours", value: 6 * HOUR_MS },
  { key: "1d", label: "1 day", value: 24 * HOUR_MS },
  { key: "1w", label: "1 week", value: 7 * 24 * HOUR_MS },
] as const;
const CUSTOM_PRESET_KEY = "custom";

function msToHours(value?: number): number | undefined {
  if (value == null) return undefined;
  return value / HOUR_MS;
}

function findPresetKey(value?: number): string | undefined {
  if (value == null) return undefined;
  return EPHEMERAL_PRESETS.find((preset) => preset.value === value)?.key;
}

function formatEphemeralHours(value?: number): string {
  const hours = msToHours(value);
  return hours == null ? "" : `${round1(hours)} h`;
}

function ephemeralSignupUrl(token?: string): string {
  if (!token) return "";
  if (typeof window === "undefined") {
    return `/ephemeral?token=${token}`;
  }
  const { protocol, host } = window.location;
  return `${protocol}//${host}/ephemeral?token=${token}`;
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
  const [sel_rows, set_sel_rows] = React.useState<any>([]);

  // Antd
  const [form] = Form.useForm();

  // we load the data in a map, indexed by the token
  // dates are converted to dayjs on the fly
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
            ephemeral: null,
          },
        },
      });
      const data = {};
      let warn_signup = true;
      for (const x of result.query.registration_tokens) {
        if (x.expires) x.expires = dayjs(x.expires);
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
    load();
  }, []);

  React.useEffect(() => {
    if (editing != null) {
      // antd's form want's something called "Store" – which is just this?
      form.setFieldsValue(editing as any);
    }
    if (last_saved != null) {
      set_last_saved(null);
    }
  }, [editing]);

  // saving a specific token value converts dayjs back to pure Date objects
  // we also record the last saved token as a template for the next add operation
  async function save(val): Promise<void> {
    // antd wraps the time in a dayjs object
    const val_orig: Token = { ...val };
    if (editing != null) set_editing(null);

    // data preparation
    if (val.expires != null && dayjs.isDayjs(val.expires)) {
      val.expires = dayjs(val.expires).toDate();
    }
    val.disabled = !val.active;
    val = pick(val, [
      "token",
      "disabled",
      "expires",
      "limit",
      "descr",
      "ephemeral",
    ] as RegistrationTokenSetFields[]);
    // set optional field to undefined (to get rid of it)
    ["descr", "limit", "expires", "ephemeral"].forEach(
      (k: RegistrationTokenSetFields) => (val[k] = val[k] ?? undefined),
    );
    try {
      set_saving(true);
      await query({
        query: {
          registration_tokens: val,
        },
      });
      // we save the original one, with dayjs in it!
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
    single: boolean = false,
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
    sel_rows,
    set_sel_rows,
    set_deleting,
    set_editing,
    new_random_token,
    edit_new_token,
    save,
    load,
    no_or_all_inactive,
  };
}

export function RegistrationToken() {
  // TODO I'm sure this could be done in a smarter way ...
  const {
    data,
    form,
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
    const limit_min = editing != null ? (editing.counter ?? 0) : 0;

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
        <Form.Item name="ephemeral" hidden>
          <InputNumber />
        </Form.Item>
        <Form.Item label="Ephemeral lifetime">
          <Form.Item
            noStyle
            shouldUpdate={(prev, curr) => prev.ephemeral !== curr.ephemeral}
          >
            {(formInstance) => {
              const ephemeral = formInstance.getFieldValue("ephemeral");
              const presetKey = findPresetKey(ephemeral);
              const selection =
                presetKey ??
                (ephemeral != null ? CUSTOM_PRESET_KEY : undefined);
              const customHours = msToHours(ephemeral);

              const handleRadioChange = ({
                target: { value },
              }: RadioChangeEvent) => {
                if (value === CUSTOM_PRESET_KEY) {
                  if (ephemeral == null) {
                    formInstance.setFieldsValue({ ephemeral: HOUR_MS });
                  }
                  return;
                }
                const preset = EPHEMERAL_PRESETS.find(
                  (option) => option.key === value,
                );
                formInstance.setFieldsValue({
                  ephemeral: preset?.value,
                });
              };

              const handleCustomHoursChange = (
                hours: number | string | null,
              ) => {
                const numeric =
                  typeof hours === "string" ? parseFloat(hours) : hours;
                if (typeof numeric === "number" && !isNaN(numeric)) {
                  formInstance.setFieldsValue({
                    ephemeral: numeric >= 0 ? numeric * HOUR_MS : undefined,
                  });
                } else {
                  formInstance.setFieldsValue({ ephemeral: undefined });
                }
              };

              return (
                <>
                  <Radio.Group value={selection} onChange={handleRadioChange}>
                    {EPHEMERAL_PRESETS.map(({ key, label }) => (
                      <Radio key={key} value={key}>
                        {label}
                      </Radio>
                    ))}
                    <Radio value={CUSTOM_PRESET_KEY}>Custom</Radio>
                  </Radio.Group>
                  {selection === CUSTOM_PRESET_KEY && (
                    <div style={{ marginTop: "10px" }}>
                      <InputNumber
                        min={0}
                        step={1}
                        value={customHours ?? undefined}
                        onChange={handleCustomHoursChange}
                        placeholder="Enter hours"
                      />{" "}
                      hours
                    </div>
                  )}
                </>
              );
            }}
          </Form.Item>
        </Form.Item>
        <Form.Item name="active" label="Active" valuePropName="checked">
          <Switch />
        </Form.Item>
        <Form.Item {...tailLayout}>
          <AntdButton.Group>
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
              <CancelText />
            </AntdButton>
            <AntdButton onClick={onRandom}>Randomize</AntdButton>
          </AntdButton.Group>
        </Form.Item>
      </Form>
    );
  }

  function render_buttons() {
    const any_selected = sel_rows.length > 0;
    return (
      <AntdButton.Group style={{ margin: "10px 0" }}>
        <AntdButton
          type={!any_selected ? "primary" : "default"}
          disabled={any_selected}
          onClick={() => edit_new_token()}
        >
          <Icon name="plus" />
          Add
        </AntdButton>

        <AntdButton
          type={any_selected ? "primary" : "default"}
          onClick={delete_tokens}
          disabled={!any_selected}
          loading={deleting}
        >
          <Icon name="trash" />
          {any_selected ? `Delete ${sel_rows.length} token(s)` : "Delete"}
        </AntdButton>

        <AntdButton onClick={() => load()}>
          <Icon name="refresh" />
          Refresh
        </AntdButton>
      </AntdButton.Group>
    );
  }

  function render_view(): Rendered {
    const table_data = sortBy(
      Object.values(data).map((v) => {
        v.key = v.token;
        return v;
      }),
      "token",
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
          <Table.Column<Token>
            title="Ephemeral link"
            width={240}
            render={(_, token) => {
              if (!token?.ephemeral) return null;
              const url = ephemeralSignupUrl(token.token);
              if (!url) return null;
              return (
                <Copyable
                  value={url}
                  inputWidth="14em"
                  outerStyle={{ width: "100%" }}
                />
              );
            }}
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
            title="Ephemeral (hours)"
            dataIndex="ephemeral"
            render={(value) => formatEphemeralHours(value)}
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
                          pct > 90 ? COLORS.ANTD_BG_RED_L : undefined,
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
            render={(v) => (v != null ? <TimeAgo date={v} /> : "never")}
            sorter={(a, b) => cmp_dayjs(a.expires, b.expires, true)}
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

  function render_unsupported() {
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

  const account_store: any = redux.getStore("account");
  if (account_store == null) {
    return <div>Account store not defined -- try again...</div>;
  }
  const strategies: List<TypedMap<PassportStrategyFrontend>> | undefined =
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
