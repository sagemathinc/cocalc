/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Admin UI for membership tiers.
*/

import {
  Button,
  Checkbox,
  Divider,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Space,
  Switch,
  Table,
  Typography,
} from "antd";
import dayjs from "dayjs";
import jsonic from "jsonic";
import { sortBy, pick } from "lodash";

import { React } from "@cocalc/frontend/app-framework";
import {
  Icon,
  ErrorDisplay,
  Saving,
  TimeAgo,
} from "@cocalc/frontend/components";
import { JsonObjectEditor } from "@cocalc/frontend/components/json-object-editor";
import { query } from "@cocalc/frontend/frame-editors/generic/client";
import { DEFAULT_QUOTAS } from "@cocalc/util/upgrade-spec";
import { COLORS } from "@cocalc/util/theme";

const { Paragraph, Text } = Typography;

const TEMPLATE_PRIORITY = {
  free: 0,
  student: 10,
  member: 20,
  pro: 30,
} as const;

function quotaTemplate(overrides: Record<string, number>) {
  return { ...DEFAULT_QUOTAS, ...overrides };
}

const minLlmLimit = 50;

function llmLimitsFromYearly(price_yearly: number, monthlyOverride?: number) {
  const monthlyCost = monthlyOverride ?? price_yearly / 12;
  const monthlyBudget = monthlyCost * 0.5;
  const units5h = Math.max(minLlmLimit, Math.round(monthlyBudget * 0.1 * 100));
  const units7d = Math.max(minLlmLimit, Math.round((monthlyBudget / 2) * 100));
  return {
    units_5h: units5h,
    units_7d: units7d,
  };
}

const TIER_TEMPLATES = {
  free: {
    id: "free",
    label: "Free",
    store_visible: false,
    price_monthly: 0,
    price_yearly: 0,
    priority: TEMPLATE_PRIORITY.free,
    project_defaults: quotaTemplate({
      network: 0,
      member_host: 0,
      mintime: 900,
      memory: 2000,
      cores: 0.75,
    }),
    llm_limits: llmLimitsFromYearly(0, 3),
    features: {
      create_hosts: false,
      project_host_tier: 0,
    },
  },
  student: {
    id: "student",
    label: "Student",
    store_visible: false,
    price_monthly: 8,
    price_yearly: 9 * 8,
    priority: TEMPLATE_PRIORITY.student,
    project_defaults: quotaTemplate({
      network: 1,
      member_host: 1,
      mintime: 1800,
      memory: 4000,
      cores: 1,
    }),
    llm_limits: llmLimitsFromYearly(9 * 8),
    features: {
      create_hosts: false,
      project_host_tier: 0,
    },
  },
  member: {
    id: "member",
    label: "Member",
    store_visible: true,
    priority: TEMPLATE_PRIORITY.member,
    price_monthly: 25,
    price_yearly: 25 * 9,
    project_defaults: quotaTemplate({
      network: 1,
      member_host: 1,
      disk_quota: 10000,
      memory: 8000,
      cores: 2,
      mintime: 3600,
    }),
    llm_limits: llmLimitsFromYearly(25 * 9),
    features: {
      create_hosts: true,
      project_host_tier: 1,
    },
  },
  pro: {
    id: "pro",
    label: "Pro",
    store_visible: true,
    priority: TEMPLATE_PRIORITY.pro,
    price_monthly: 150,
    price_yearly: 150 * 9,
    project_defaults: quotaTemplate({
      network: 1,
      member_host: 1,
      disk_quota: 10000,
      memory: 16000,
      cores: 3,
      mintime: 8 * 3600,
    }),
    llm_limits: llmLimitsFromYearly(150 * 9),
    features: {
      create_hosts: true,
      project_host_tier: 2,
    },
  },
};

interface Tier {
  key?: string;
  id: string;
  label?: string;
  store_visible?: boolean;
  priority?: number;
  price_monthly?: number;
  price_yearly?: number;
  project_defaults?: any;
  llm_limits?: any;
  features?: any;
  disabled?: boolean;
  notes?: string;
  history?: any[];
  subscription_count?: number;
  account_count?: number;
  created?: dayjs.Dayjs;
  updated?: dayjs.Dayjs;
}

function parseJsonField(
  value: string | unknown | undefined,
  label: string,
): any | undefined {
  if (value == null) return undefined;
  if (typeof value === "string" && value.trim() === "") return undefined;
  try {
    if (typeof value !== "string") {
      return value;
    }
    const parsed = jsonic(value);
    if (parsed != null && typeof parsed !== "object") {
      throw Error(`Expected a JSON object`);
    }
    return parsed;
  } catch (err) {
    throw Error(`Invalid JSON for ${label}: ${err}`);
  }
}

function use_membership_tiers() {
  const [data, set_data] = React.useState<{ [key: string]: Tier }>({});
  const [editing, set_editing] = React.useState<Tier | null>(null);
  const [saving, set_saving] = React.useState<boolean>(false);
  const [deleting, set_deleting] = React.useState<boolean>(false);
  const [loading, set_loading] = React.useState<boolean>(false);
  const [last_saved, set_last_saved] = React.useState<Tier | null>(null);
  const [error, set_error] = React.useState<string>("");
  const [sel_rows, set_sel_rows] = React.useState<any>([]);

  const [form] = Form.useForm();

  async function load() {
    let result: any;
    set_loading(true);
    try {
      result = await query({
        query: {
          membership_tiers: {
            id: "*",
            label: null,
            store_visible: null,
            priority: null,
            price_monthly: null,
            price_yearly: null,
            project_defaults: null,
            llm_limits: null,
            features: null,
            disabled: null,
            notes: null,
            history: null,
            created: null,
            updated: null,
          },
        },
      });
      const next = {};
      for (const row of result.query.membership_tiers ?? []) {
        if (row.created) row.created = dayjs(row.created);
        if (row.updated) row.updated = dayjs(row.updated);
        next[row.id] = row;
      }
      set_error("");
      set_data(next);
    } catch (err) {
      set_error(err.message ?? String(err));
    } finally {
      set_loading(false);
    }
  }

  React.useEffect(() => {
    set_sel_rows([]);
    load();
  }, []);

  React.useEffect(() => {
    if (editing != null) {
      form.setFieldsValue({
        ...editing,
        project_defaults: editing.project_defaults ?? {},
        llm_limits: editing.llm_limits ?? {},
        features: editing.features ?? {},
        active: !editing.disabled,
      });
    }
    if (last_saved != null) {
      set_last_saved(null);
    }
  }, [editing]);

  async function save(values): Promise<void> {
    const val_orig: Tier = { ...values };
    if (editing != null) set_editing(null);

    try {
      set_saving(true);
      const project_defaults = parseJsonField(
        values.project_defaults,
        "project_defaults",
      );
      const llm_limits = parseJsonField(values.llm_limits, "llm_limits");
      const features = parseJsonField(values.features, "features");

      const payload = pick(
        {
          ...values,
          project_defaults,
          llm_limits,
          features,
          disabled: !values.active,
        },
        [
          "id",
          "label",
          "store_visible",
          "priority",
          "price_monthly",
          "price_yearly",
          "project_defaults",
          "llm_limits",
          "features",
          "disabled",
          "notes",
        ],
      );

      await query({
        query: {
          membership_tiers: payload,
        },
      });
      set_last_saved(val_orig);
      await load();
    } catch (err) {
      set_error(err.message ?? String(err));
      set_editing(val_orig);
    } finally {
      set_saving(false);
    }
  }

  async function delete_tier(id: string | undefined, single = false) {
    if (!id) return;
    if (single) set_deleting(true);
    try {
      if ((data[id]?.subscription_count ?? 0) > 0) {
        throw Error("cannot delete a tier with active subscriptions");
      }
      await query({
        query: {
          membership_tiers: { id },
        },
        options: [{ delete: true }],
      });
      if (single) load();
    } catch (err) {
      if (single) {
        set_error(err.message ?? String(err));
      } else {
        throw err;
      }
    } finally {
      if (single) set_deleting(false);
    }
  }

  async function delete_tiers(): Promise<void> {
    set_deleting(true);
    try {
      const blocked = sel_rows.filter(
        (id) => (data[id]?.subscription_count ?? 0) > 0,
      );
      if (blocked.length > 0) {
        throw Error(
          `Cannot delete tiers with active subscriptions: ${blocked.join(", ")}`,
        );
      }
      await sel_rows.map(async (id) => await delete_tier(id));
      set_sel_rows([]);
      load();
    } catch (err) {
      set_error(err.message ?? String(err));
    } finally {
      set_deleting(false);
    }
  }

  function edit_new_tier() {
    set_editing({
      id: "",
      label: "",
      store_visible: false,
      priority: 0,
      disabled: false,
      notes: "",
      project_defaults: {},
      llm_limits: {},
      features: {
        create_hosts: false,
        project_host_tier: 0,
      },
    });
  }

  return {
    data,
    form,
    editing,
    saving,
    deleting,
    delete_tier,
    delete_tiers,
    loading,
    last_saved,
    error,
    set_error,
    sel_rows,
    set_sel_rows,
    set_editing,
    edit_new_tier,
    save,
    load,
  };
}

export function MembershipTiers() {
  const {
    data,
    form,
    editing,
    saving,
    deleting,
    delete_tier,
    delete_tiers,
    loading,
    last_saved,
    error,
    set_error,
    sel_rows,
    set_sel_rows,
    set_editing,
    edit_new_tier,
    save,
    load,
  } = use_membership_tiers();
  const [jsonErrors, setJsonErrors] = React.useState<Record<string, string>>(
    {},
  );

  function render_edit() {
    const layout = {
      style: { margin: "20px 0" },
      labelCol: { span: 3 },
      wrapperCol: { span: 10 },
    };
    const tailLayout = { wrapperCol: { offset: 3, span: 10 } };
    const onFinish = (values) => save(values);
    const editingExisting = editing?.id != null && data[editing.id] != null;
    const applyTemplate = (key: keyof typeof TIER_TEMPLATES) => {
      const template = TIER_TEMPLATES[key];
      form.setFieldsValue({
        ...template,
        project_defaults: template.project_defaults ?? {},
        llm_limits: template.llm_limits ?? {},
        features: (template as { features?: unknown }).features ?? {},
        active: true,
      });
    };
    const updateJsonError = (field: string, err?: string) => {
      setJsonErrors((prev) => {
        const next = { ...prev };
        if (err) {
          next[field] = err;
        } else {
          delete next[field];
        }
        return next;
      });
    };
    const hasJsonErrors = Object.keys(jsonErrors).length > 0;

    return (
      <>
        <Paragraph style={{ color: COLORS.GRAY }}>
          Templates:
          <Space style={{ marginLeft: "10px" }}>
            {(["free", "student", "member", "pro"] as const).map((key) => (
              <Button key={key} size="small" onClick={() => applyTemplate(key)}>
                {TIER_TEMPLATES[key].label}
              </Button>
            ))}
          </Space>
        </Paragraph>
        <Form
          {...layout}
          size={"middle"}
          form={form}
          name="edit-membership-tier"
          onFinish={onFinish}
        >
          <Divider>Basics</Divider>
          <Form.Item name="id" label="Tier ID" rules={[{ required: true }]}>
            <Input disabled={editingExisting} />
          </Form.Item>
          <Form.Item name="label" label="Label" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="store_visible"
            label="Visible"
            valuePropName="checked"
          >
            <Checkbox>Show in store</Checkbox>
          </Form.Item>
          <Form.Item name="priority" label="Priority">
            <InputNumber step={1} />
          </Form.Item>
          <Form.Item name="price_monthly" label="Monthly price">
            <InputNumber min={0} step={1} />
          </Form.Item>
          <Form.Item name="price_yearly" label="Yearly price">
            <InputNumber min={0} step={1} />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item
            name="active"
            label="Active"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          <Divider>Entitlements / Features</Divider>
          <Form.Item name="features" label="Features">
            <JsonObjectEditor
              emptyHint="No feature flags yet."
              onErrorChange={(err) => updateJsonError("features", err)}
            />
          </Form.Item>
          <Divider>Project Defaults</Divider>
          <Form.Item name="project_defaults" label="Defaults">
            <JsonObjectEditor
              emptyHint="No default quotas set."
              onErrorChange={(err) => updateJsonError("project_defaults", err)}
            />
          </Form.Item>
          <Divider>LLM Limits</Divider>
          <Form.Item name="llm_limits" label="Limits">
            <JsonObjectEditor
              emptyHint="No limits defined."
              onErrorChange={(err) => updateJsonError("llm_limits", err)}
            />
          </Form.Item>
          <Form.Item {...tailLayout}>
            <Button.Group>
              <Button type="primary" htmlType="submit" disabled={hasJsonErrors}>
                Save
              </Button>
              <Button
                htmlType="button"
                onClick={() => {
                  form.resetFields();
                  edit_new_tier();
                }}
              >
                Reset
              </Button>
              <Button htmlType="button" onClick={() => set_editing(null)}>
                Cancel
              </Button>
            </Button.Group>
            {hasJsonErrors && (
              <div style={{ marginTop: "8px" }}>
                <Text type="danger">
                  Fix errors in JSON fields before saving.
                </Text>
              </div>
            )}
          </Form.Item>
        </Form>
      </>
    );
  }

  function render_buttons() {
    const any_selected = sel_rows.length > 0;
    const selected_has_usage = sel_rows.some(
      (id) => (data[id]?.subscription_count ?? 0) > 0,
    );
    return (
      <Button.Group style={{ margin: "10px 0" }}>
        <Button
          type={!any_selected ? "primary" : "default"}
          disabled={any_selected}
          onClick={() => edit_new_tier()}
        >
          <Icon name="plus" /> Add
        </Button>
        <Button
          type={any_selected ? "primary" : "default"}
          onClick={delete_tiers}
          disabled={!any_selected || selected_has_usage}
          loading={deleting}
        >
          <Icon name="trash" />
          {any_selected ? `Delete ${sel_rows.length} tier(s)` : "Delete"}
        </Button>
        <Button onClick={() => load()}>
          <Icon name="refresh" /> Refresh
        </Button>
      </Button.Group>
    );
  }

  function render_view() {
    const table_data = sortBy(
      Object.values(data).map((v) => {
        v.key = v.id;
        return v;
      }),
      "id",
    );
    const rowSelection = {
      selectedRowKeys: sel_rows,
      onChange: set_sel_rows,
    };
    return (
      <>
        {render_buttons()}
        <Table<Tier>
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
            row.id === last_saved?.id ? "cocalc-highlight-saved-token" : ""
          }
        >
          <Table.Column<Tier>
            title="Tier ID"
            dataIndex="id"
            defaultSortOrder={"ascend"}
            sorter={(a, b) => a.id.localeCompare(b.id)}
          />
          <Table.Column<Tier> title="Label" dataIndex="label" />
          <Table.Column<Tier>
            title="Visible"
            dataIndex="store_visible"
            render={(val) => (val ? "Yes" : "")}
          />
          <Table.Column<Tier> title="Priority" dataIndex="priority" />
          <Table.Column<Tier>
            title="Monthly"
            dataIndex="price_monthly"
            render={(val) => (val != null ? val : "")}
          />
          <Table.Column<Tier>
            title="Yearly"
            dataIndex="price_yearly"
            render={(val) => (val != null ? val : "")}
          />
          <Table.Column<Tier>
            title="Subscriptions"
            dataIndex="subscription_count"
            render={(val) => val ?? 0}
          />
          <Table.Column<Tier>
            title="Accounts"
            dataIndex="account_count"
            render={(val) => val ?? 0}
          />
          <Table.Column<Tier>
            title="Active"
            dataIndex="disabled"
            render={(_text, tier) => {
              const click = () => save({ ...tier, active: !!tier.disabled });
              return (
                <Checkbox checked={!tier.disabled} onChange={click}></Checkbox>
              );
            }}
          />
          <Table.Column<Tier>
            title="Updated"
            dataIndex="updated"
            render={(v) => (v != null ? <TimeAgo date={v} /> : "")}
          />
          <Table.Column<Tier>
            title="History"
            dataIndex="history"
            render={(val) => (Array.isArray(val) ? val.length : 0)}
          />
          <Table.Column<Tier>
            title="Edit"
            dataIndex="edit"
            render={(_text, tier) => (
              <Icon name="pencil" onClick={() => set_editing(tier)} />
            )}
          />
          <Table.Column<Tier>
            title="Delete"
            dataIndex="delete"
            render={(_text, tier) => {
              const inUse = (tier.subscription_count ?? 0) > 0;
              if (inUse) {
                return (
                  <Text type="secondary" title="Tier in use">
                    In use
                  </Text>
                );
              }
              return (
                <Popconfirm
                  title="Sure to delete?"
                  onConfirm={() => delete_tier(tier.key, true)}
                >
                  <Icon name="trash" />
                </Popconfirm>
              );
            }}
          />
        </Table>
      </>
    );
  }

  function render_control() {
    if (editing != null) {
      return render_edit();
    }
    return render_view();
  }

  function render_error() {
    if (error) {
      return <ErrorDisplay error={error} onClose={() => set_error("")} />;
    }
    return null;
  }

  function render_info() {
    return (
      <div style={{ color: COLORS.GRAY, fontStyle: "italic" }}>
        {saving && (
          <>
            <Saving />
            <br />
          </>
        )}
        <Paragraph style={{ marginBottom: 0 }}>
          Tip: Tier IDs should be stable slugs (e.g., <Text code>member</Text>).
          Set <Text code>Visible</Text> to show tiers in the store.
        </Paragraph>
      </div>
    );
  }

  return (
    <div>
      {render_error()}
      {render_control()}
      {render_info()}
    </div>
  );
}
