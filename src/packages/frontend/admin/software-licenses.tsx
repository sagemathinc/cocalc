/*
 * Admin UI for software licenses (Launchpad/Rocket).
 */

import {
  Button,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Space,
  Switch,
  Table,
  Typography,
  message,
} from "antd";
import dayjs from "dayjs";
import jsonic from "jsonic";

import { React } from "@cocalc/frontend/app-framework";
import {
  ErrorDisplay,
  Icon,
  Loading,
  TimeAgo,
} from "@cocalc/frontend/components";
import CopyToClipBoard from "@cocalc/frontend/components/copy-to-clipboard";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import type {
  SoftwareLicense,
  SoftwareLicenseTier,
} from "@cocalc/util/db-schema/software-licenses";

const { Paragraph, Text, Title } = Typography;

function toDate(value?: string | Date | null) {
  if (!value) return undefined;
  return dayjs(value);
}

function toJsonValue(raw?: string) {
  if (!raw || raw.trim() === "") return undefined;
  const parsed = jsonic(raw);
  if (parsed != null && typeof parsed !== "object") {
    throw Error("Expected JSON object");
  }
  return parsed;
}

function formatShortId(value?: string) {
  if (!value) return "";
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

export function SoftwareLicensesAdmin() {
  const hub = webapp_client.conat_client.hub;
  const [tiers, setTiers] = React.useState<SoftwareLicenseTier[]>([]);
  const [licenses, setLicenses] = React.useState<SoftwareLicense[]>([]);
  const [loadingTiers, setLoadingTiers] = React.useState(false);
  const [loadingLicenses, setLoadingLicenses] = React.useState(false);
  const [error, setError] = React.useState<string>("");
  const [search, setSearch] = React.useState("");
  const [editingTier, setEditingTier] =
    React.useState<SoftwareLicenseTier | null>(null);
  const [tierModalOpen, setTierModalOpen] = React.useState(false);
  const [licenseModalOpen, setLicenseModalOpen] = React.useState(false);
  const [creatingLicense, setCreatingLicense] = React.useState(false);
  const [createdLicense, setCreatedLicense] =
    React.useState<SoftwareLicense | null>(null);
  const [savingTier, setSavingTier] = React.useState(false);

  const [tierForm] = Form.useForm();
  const [licenseForm] = Form.useForm();

  const loadTiers = React.useCallback(async () => {
    setLoadingTiers(true);
    try {
      const list = await hub.software.listLicenseTiers({
        include_disabled: true,
      });
      setTiers(list ?? []);
      setError("");
    } catch (err) {
      setError(String(err));
    } finally {
      setLoadingTiers(false);
    }
  }, [hub]);

  const loadLicenses = React.useCallback(async () => {
    setLoadingLicenses(true);
    try {
      const list = await hub.software.listLicenses({
        search: search || undefined,
        limit: 200,
      });
      setLicenses(list ?? []);
      setError("");
    } catch (err) {
      setError(String(err));
    } finally {
      setLoadingLicenses(false);
    }
  }, [hub, search]);

  React.useEffect(() => {
    loadTiers();
    loadLicenses();
  }, [loadTiers, loadLicenses]);

  const openTierModal = (tier?: SoftwareLicenseTier) => {
    const next = tier ?? {
      id: "",
      label: "",
      description: "",
      max_accounts: undefined,
      max_project_hosts: undefined,
      max_active_licenses: undefined,
      defaults: {},
      features: {},
      disabled: false,
      notes: "",
    };
    setEditingTier(next);
    tierForm.setFieldsValue({
      ...next,
      defaults: next.defaults ? JSON.stringify(next.defaults, null, 2) : "",
      features: next.features ? JSON.stringify(next.features, null, 2) : "",
    });
    setTierModalOpen(true);
  };

  const saveTier = async () => {
    const values = await tierForm.validateFields();
    setSavingTier(true);
    try {
      const tier: SoftwareLicenseTier = {
        id: values.id,
        label: values.label,
        description: values.description,
        max_accounts: values.max_accounts,
        max_project_hosts: values.max_project_hosts,
        max_active_licenses: values.max_active_licenses,
        defaults: toJsonValue(values.defaults),
        features: toJsonValue(values.features),
        disabled: values.disabled,
        notes: values.notes,
      };
      await hub.software.upsertLicenseTier({ tier });
      message.success("Tier saved");
      setTierModalOpen(false);
      await loadTiers();
    } catch (err) {
      message.error(`Failed to save tier: ${err}`);
    } finally {
      setSavingTier(false);
    }
  };

  const createLicense = async () => {
    const values = await licenseForm.validateFields();
    setCreatingLicense(true);
    try {
      const license = await hub.software.createLicense({
        tier_id: values.tier_id,
        owner_account_id: values.owner_account_id || undefined,
        product: values.product || "launchpad",
        expires_at: values.expires_at
          ? dayjs(values.expires_at).toISOString()
          : undefined,
        limits: toJsonValue(values.limits),
        features: toJsonValue(values.features),
        notes: values.notes,
      });
      setCreatedLicense(license);
      setLicenseModalOpen(false);
      licenseForm.resetFields();
      message.success("License created");
      await loadLicenses();
    } catch (err) {
      message.error(`Failed to create license: ${err}`);
    } finally {
      setCreatingLicense(false);
    }
  };

  const revokeLicense = async (license_id: string) => {
    try {
      await hub.software.revokeLicense({ license_id });
      message.success("License revoked");
      await loadLicenses();
    } catch (err) {
      message.error(`Failed to revoke: ${err}`);
    }
  };

  const restoreLicense = async (license_id: string) => {
    try {
      await hub.software.restoreLicense({ license_id });
      message.success("License restored");
      await loadLicenses();
    } catch (err) {
      message.error(`Failed to restore: ${err}`);
    }
  };

  const licenseColumns = [
    {
      title: "License",
      dataIndex: "id",
      render: (value) => (
        <CopyToClipBoard
          value={value}
          display={formatShortId(value)}
          inputWidth="18ex"
        />
      ),
    },
    { title: "Tier", dataIndex: "tier_id" },
    {
      title: "Owner",
      dataIndex: "owner_account_id",
      render: (value) => value ?? "—",
    },
    {
      title: "Created",
      dataIndex: "created",
      render: (value) => (value ? <TimeAgo date={value} /> : "—"),
    },
    {
      title: "Expires",
      dataIndex: "expires_at",
      render: (value) => (value ? toDate(value)?.format("YYYY-MM-DD") : "—"),
    },
    {
      title: "Status",
      dataIndex: "revoked_at",
      render: (value) => (value ? "revoked" : "active"),
    },
    {
      title: "Actions",
      render: (_, record: SoftwareLicense) => (
        <Space>
          {record.revoked_at ? (
            <Button size="small" onClick={() => restoreLicense(record.id)}>
              Restore
            </Button>
          ) : (
            <Popconfirm
              title="Revoke this license?"
              okText="Revoke"
              okButtonProps={{ danger: true }}
              onConfirm={() => revokeLicense(record.id)}
            >
              <Button danger size="small">
                Revoke
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const tierColumns = [
    { title: "Id", dataIndex: "id" },
    { title: "Label", dataIndex: "label" },
    { title: "Max accounts", dataIndex: "max_accounts" },
    { title: "Max hosts", dataIndex: "max_project_hosts" },
    { title: "Max licenses", dataIndex: "max_active_licenses" },
    {
      title: "Disabled",
      dataIndex: "disabled",
      render: (value) => (value ? "yes" : "no"),
    },
    {
      title: "Actions",
      render: (_, record: SoftwareLicenseTier) => (
        <Button size="small" onClick={() => openTierModal(record)}>
          Edit
        </Button>
      ),
    },
  ];

  return (
    <div>
      <Title level={4}>Software Licenses</Title>
      {error && <ErrorDisplay error={error} />}

      <Paragraph type="secondary">
        Manage Launchpad/Rocket software license tiers and issued license tokens.
      </Paragraph>

      <Divider titlePlacement="start">License Tiers</Divider>
      <Space style={{ marginBottom: 12 }}>
        <Button onClick={() => openTierModal()} type="primary">
          <Icon name="plus" /> New tier
        </Button>
        <Button onClick={loadTiers}>Refresh</Button>
        {loadingTiers && <Loading theme="medium" />}
      </Space>
      <Table
        size="small"
        dataSource={tiers.map((tier) => ({ key: tier.id, ...tier }))}
        columns={tierColumns}
        pagination={false}
      />

      <Divider titlePlacement="start">Licenses</Divider>
      <Space style={{ marginBottom: 12 }}>
        <Input
          placeholder="Search by license id or owner"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onPressEnter={() => loadLicenses()}
          style={{ width: 320 }}
        />
        <Button onClick={loadLicenses}>Search</Button>
        <Button type="primary" onClick={() => setLicenseModalOpen(true)}>
          <Icon name="plus" /> Create license
        </Button>
        {loadingLicenses && <Loading theme="medium" />}
      </Space>
      <Table
        size="small"
        dataSource={licenses.map((license) => ({ key: license.id, ...license }))}
        columns={licenseColumns}
        pagination={{ pageSize: 25 }}
      />

      <Modal
        title="License Tier"
        open={tierModalOpen}
        onCancel={() => setTierModalOpen(false)}
        onOk={saveTier}
        confirmLoading={savingTier}
        okText="Save"
      >
        <Form form={tierForm} layout="vertical">
          <Form.Item
            label="Tier id"
            name="id"
            rules={[{ required: true }]}
          >
            <Input disabled={!!editingTier?.id} />
          </Form.Item>
          <Form.Item label="Label" name="label">
            <Input />
          </Form.Item>
          <Form.Item label="Description" name="description">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item label="Max accounts" name="max_accounts">
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item label="Max project hosts" name="max_project_hosts">
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item label="Max active licenses" name="max_active_licenses">
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item label="Defaults (JSON)" name="defaults">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item label="Features (JSON)" name="features">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item label="Disabled" name="disabled" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item label="Notes" name="notes">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Create License"
        open={licenseModalOpen}
        onCancel={() => {
          setLicenseModalOpen(false);
          licenseForm.resetFields();
        }}
        onOk={createLicense}
        confirmLoading={creatingLicense}
        okText="Create"
      >
        <Form form={licenseForm} layout="vertical">
          <Form.Item
            label="Tier id"
            name="tier_id"
            rules={[{ required: true }]}
          >
            <Input />
          </Form.Item>
          <Form.Item label="Owner account id" name="owner_account_id">
            <Input />
          </Form.Item>
          <Form.Item label="Product" name="product" initialValue="launchpad">
            <Input />
          </Form.Item>
          <Form.Item label="Expires at (ISO or yyyy-mm-dd)" name="expires_at">
            <Input />
          </Form.Item>
          <Form.Item label="Limits overrides (JSON)" name="limits">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item label="Features overrides (JSON)" name="features">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item label="Notes" name="notes">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="License created"
        open={!!createdLicense}
        onCancel={() => setCreatedLicense(null)}
        onOk={() => setCreatedLicense(null)}
        okText="Close"
      >
        <Paragraph>
          <Text strong>License token</Text>
        </Paragraph>
        <Paragraph type="secondary">
          Copy and store this token securely. You will paste it into the
          Launchpad/Rocket instance to activate the license. This is a bearer
          token.
        </Paragraph>
        {createdLicense?.token && (
          <Paragraph
            copyable={{ text: createdLicense.token }}
            style={{ wordBreak: "break-all", fontFamily: "monospace" }}
          >
            {createdLicense.token}
          </Paragraph>
        )}
      </Modal>
    </div>
  );
}
