/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Admin UI for managing OAuth2 Provider clients.
// Follows the registration-token table pattern.

import {
  Alert,
  Button,
  Descriptions,
  Form,
  Input,
  Modal,
  Popconfirm,
  Radio,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from "antd";
import { useCallback, useEffect, useState } from "react";

import {
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  SyncOutlined,
} from "@ant-design/icons";
import { A, ErrorDisplay, Icon, Tip, TimeAgo } from "@cocalc/frontend/components";
import Copyable from "@cocalc/frontend/components/copy-to-clipboard";
import api from "@cocalc/frontend/client/api";
import { COLORS } from "@cocalc/util/theme";

const { Text, Paragraph } = Typography;

function scopeOption(value: string, tip: string) {
  return {
    value,
    label: <Tip title={tip} placement="right">{value}</Tip>,
  };
}

const SCOPE_OPTIONS = [
  scopeOption("openid", "Basic identity information"),
  scopeOption("profile", "User profile (name, avatar)"),
  scopeOption("email", "Email address"),
  scopeOption("api:read", "Read access (list projects, ping, user search, read-only queries)"),
  scopeOption("api:write", "Write access (create projects, send messages, modify settings)"),
  scopeOption("api:project", "Access all projects where user is collaborator"),
];

interface TokenStats {
  active_access_tokens: number;
  active_refresh_tokens: number;
  last_active: string | null;
}

interface OAuth2ClientRow {
  client_id: string;
  name: string;
  description: string;
  mode: "web" | "native";
  redirect_uris: string[];
  grant_types: string[];
  scopes: string[];
  created_by: string;
  created: string;
  modified: string;
  active: boolean;
  stats: TokenStats;
}

const CREATE_DEFAULTS = {
  mode: "web" as const,
  scopes: ["openid", "profile", "email", "api:read"],
};

export function OAuth2Clients() {
  const [clients, setClients] = useState<OAuth2ClientRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [enabled, setEnabled] = useState(true);
  const [defaultNativeClientId, setDefaultNativeClientId] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  // null = create new, OAuth2ClientRow = edit existing
  const [editingClient, setEditingClient] = useState<OAuth2ClientRow | null>(
    null,
  );
  const [newSecret, setNewSecret] = useState<string>("");
  const [newClientId, setNewClientId] = useState<string>("");

  const [form] = Form.useForm();
  const isCreate = editingClient == null;

  const loadClients = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api("oauth2/clients");
      if (result.error) {
        setError(result.error);
      } else {
        setClients(result.clients ?? []);
        setEnabled(result.enabled !== false);
        setDefaultNativeClientId(result.default_native_client_id ?? "");
      }
    } catch (err) {
      setError(`${err}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  const openCreate = () => {
    setEditingClient(null);
    form.setFieldsValue({ ...CREATE_DEFAULTS, name: "", description: "", redirect_uris: "" });
    setModalOpen(true);
  };

  const openDuplicate = (record: OAuth2ClientRow) => {
    // Increment name: "Foo" → "Foo (1)", "Foo (1)" → "Foo (2)", etc.
    const match = record.name.match(/^(.*?)\s*\((\d+)\)$/);
    const name = match
      ? `${match[1]} (${parseInt(match[2]) + 1})`
      : `${record.name} (1)`;
    setEditingClient(null);
    form.setFieldsValue({
      name,
      description: record.description,
      mode: record.mode ?? "web",
      redirect_uris: (record.redirect_uris ?? []).join("\n"),
      scopes: record.scopes ?? [],
    });
    setModalOpen(true);
  };

  const openEdit = (record: OAuth2ClientRow) => {
    setEditingClient(record);
    form.setFieldsValue({
      name: record.name,
      description: record.description,
      mode: record.mode ?? "web",
      redirect_uris: (record.redirect_uris ?? []).join("\n"),
      scopes: record.scopes ?? [],
      active: record.active,
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingClient(null);
    form.resetFields();
  };

  const handleSubmit = async (values: {
    name: string;
    description?: string;
    mode: "web" | "native";
    redirect_uris: string;
    scopes?: string[];
    active?: boolean;
  }) => {
    setError("");
    try {
      const redirectUris = values.redirect_uris
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      if (isCreate) {
        const result = await api("oauth2/clients", {
          name: values.name,
          description: values.description ?? "",
          mode: values.mode,
          redirect_uris: redirectUris,
          scopes: values.scopes,
        });
        if (result.error) {
          setError(result.error);
        } else {
          setNewSecret(result.client_secret);
          setNewClientId(result.client_id);
          closeModal();
          await loadClients();
        }
      } else if (editingClient) {
        const result = await api(`oauth2/${editingClient.client_id}`, {
          name: values.name,
          description: values.description,
          mode: values.mode,
          redirect_uris: redirectUris,
          scopes: values.scopes,
          active: values.active,
        });
        if (result.error) {
          setError(result.error);
        } else {
          closeModal();
          await loadClients();
        }
      }
    } catch (err) {
      setError(`${err}`);
    }
  };

  const handleDelete = async (clientId: string) => {
    setError("");
    try {
      const result = await api(`oauth2/${clientId}`, {
        action: "delete",
      });
      if (result.error) {
        setError(result.error);
      }
      await loadClients();
    } catch (err) {
      setError(`${err}`);
    }
  };

  const handleRegenerateSecret = async (clientId: string) => {
    setError("");
    try {
      const result = await api(`oauth2/${clientId}`, {
        action: "regenerate-secret",
      });
      if (result.error) {
        setError(result.error);
      } else {
        setNewSecret(result.client_secret);
        setNewClientId(clientId);
      }
    } catch (err) {
      setError(`${err}`);
    }
  };

  const columns = [
    {
      title: "Name",
      dataIndex: "name",
      key: "name",
      sorter: (a: OAuth2ClientRow, b: OAuth2ClientRow) =>
        a.name.localeCompare(b.name),
      render: (name: string, record: OAuth2ClientRow) => (
        <span>
          <strong>{name}</strong>{" "}
          {record.client_id === defaultNativeClientId && (
            <Tag color="purple" style={{ marginLeft: 4 }}>
              default
            </Tag>
          )}
          {!record.active && (
            <Tag color="red" style={{ marginLeft: 4 }}>
              Inactive
            </Tag>
          )}
        </span>
      ),
    },
    {
      title: "Description",
      dataIndex: "description",
      key: "description",
      ellipsis: true,
      render: (desc: string) => desc || "—",
    },
    {
      title: "Mode",
      dataIndex: "mode",
      key: "mode",
      width: 80,
      filters: [
        { text: "web", value: "web" },
        { text: "native", value: "native" },
      ],
      onFilter: (value: any, record: OAuth2ClientRow) =>
        record.mode === value,
      render: (mode: string) => (
        <Tag color={mode === "native" ? "green" : "blue"}>{mode ?? "web"}</Tag>
      ),
    },
    {
      title: "Tokens",
      key: "tokens",
      width: 80,
      sorter: (a: OAuth2ClientRow, b: OAuth2ClientRow) =>
        (a.stats?.active_access_tokens ?? 0) -
        (b.stats?.active_access_tokens ?? 0),
      render: (_: unknown, record: OAuth2ClientRow) => {
        const s = record.stats;
        if (!s) return "—";
        return (
          <span title="access / refresh tokens">
            {s.active_access_tokens} / {s.active_refresh_tokens}
          </span>
        );
      },
    },
    {
      title: "Created",
      dataIndex: "created",
      key: "created",
      width: 140,
      sorter: (a: OAuth2ClientRow, b: OAuth2ClientRow) => {
        const aTime = a.created ? new Date(a.created).getTime() : 0;
        const bTime = b.created ? new Date(b.created).getTime() : 0;
        return aTime - bTime;
      },
      render: (created: string) =>
        created ? <TimeAgo date={created} /> : "—",
    },
    {
      title: "Last Active",
      key: "last_active",
      width: 140,
      sorter: (a: OAuth2ClientRow, b: OAuth2ClientRow) => {
        const aTime = a.stats?.last_active
          ? new Date(a.stats.last_active).getTime()
          : 0;
        const bTime = b.stats?.last_active
          ? new Date(b.stats.last_active).getTime()
          : 0;
        return aTime - bTime;
      },
      render: (_: unknown, record: OAuth2ClientRow) => {
        const la = record.stats?.last_active;
        return la ? (
          <TimeAgo date={la} />
        ) : (
          <span style={{ color: COLORS.GRAY_L }}>never</span>
        );
      },
    },
    {
      title: "Active",
      dataIndex: "active",
      key: "active",
      width: 80,
      filters: [
        { text: "Active", value: true },
        { text: "Inactive", value: false },
      ],
      onFilter: (value: any, record: OAuth2ClientRow) =>
        record.active === value,
      render: (active: boolean, record: OAuth2ClientRow) => (
        <Switch
          size="small"
          checked={active}
          onChange={async (checked) => {
            try {
              await api(`oauth2/${record.client_id}`, {
                active: checked,
              });
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            } finally {
              await loadClients();
            }
          }}
        />
      ),
    },
    {
      title: "Actions",
      key: "actions",
      width: 180,
      render: (_: unknown, record: OAuth2ClientRow) => (
        <Space size={0}>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEdit(record)}
            title="Edit"
          />
          <Button
            type="text"
            size="small"
            icon={<CopyOutlined />}
            onClick={() => openDuplicate(record)}
            title="Duplicate"
          />
          <Popconfirm
            title="Regenerate client secret?"
            description="The old secret will stop working immediately."
            onConfirm={() => handleRegenerateSecret(record.client_id)}
          >
            <Button
              type="text"
              size="small"
              icon={<SyncOutlined />}
              title="Regenerate Secret"
            />
          </Popconfirm>
          <Popconfirm
            title="Delete this OAuth2 client?"
            description="All tokens and codes will also be deleted."
            onConfirm={() => handleDelete(record.client_id)}
          >
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              title="Delete"
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const expandedRowRender = (record: OAuth2ClientRow) => {
    const items = [
      {
        key: "client_id",
        label: "Client ID",
        children: (
          <Text copyable code style={{ fontSize: "11px" }}>
            {record.client_id}
          </Text>
        ),
      },
      {
        key: "description",
        label: "Description",
        children: record.description || "—",
      },
      {
        key: "redirect_uris",
        label: "Redirect URIs",
        children: (record.redirect_uris ?? []).map((uri) => (
          <Tag key={uri} style={{ marginBottom: 2 }}>
            {uri}
          </Tag>
        )),
      },
      {
        key: "scopes",
        label: "Scopes",
        children: (record.scopes ?? []).map((s) => (
          <Tag key={s} color="blue">
            {s}
          </Tag>
        )),
      },
      {
        key: "created",
        label: "Created",
        children: record.created ? <TimeAgo date={record.created} /> : "—",
      },
      {
        key: "modified",
        label: "Modified",
        children: record.modified ? <TimeAgo date={record.modified} /> : "—",
      },
    ];
    return <Descriptions size="small" column={2} items={items} />;
  };

  return (
    <div>
      <Paragraph style={{ color: COLORS.GRAY_M }}>
        Register OAuth2 client applications that can authenticate users via
        CoCalc. Use <strong>web</strong> mode for server-side apps (HTTPS
        redirects) or <strong>native</strong> mode for desktop/CLI apps
        (localhost redirects per{" "}
        <A href={"https://datatracker.ietf.org/doc/html/rfc8252"}>RFC 8252</A>).
      </Paragraph>
      <Paragraph style={{ color: COLORS.GRAY_M }}>
        Access tokens expire after 1 hour. Refresh tokens last 30 days with
        sliding expiration (renewed on each use).
      </Paragraph>

      {!enabled && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="OAuth2 Provider is disabled"
          description={
            <span>
              Enable it in <strong>Site Settings</strong> → <em>OAuth2 Provider Enabled</em> and restart the hub.
            </span>
          }
        />
      )}

      {error && (
        <ErrorDisplay
          error={error}
          onClose={() => setError("")}
          style={{ marginBottom: 16 }}
        />
      )}

      <Modal
        title={
          <span>
            <Icon name="warning" /> Client Secret — copy now, shown only once!
          </span>
        }
        open={!!newSecret}
        closable={false}
        maskClosable={false}
        keyboard={false}
        footer={
          <Button type="primary" onClick={() => setNewSecret("")}>
            I have copied the secret
          </Button>
        }
      >
        <div>Client ID:</div>
        <Copyable value={newClientId} size="small" inputWidth="100%" style={{ overflow: "hidden" }} />
        <div style={{ marginTop: 10 }}>Client Secret:</div>
        <Copyable value={newSecret} size="small" inputWidth="100%" style={{ overflow: "hidden" }} />
      </Modal>

      <Space.Compact style={{ marginBottom: 16 }}>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={openCreate}
        >
          Register Client
        </Button>
        <Button
          icon={<ReloadOutlined />}
          onClick={loadClients}
          loading={loading}
        >
          Refresh
        </Button>
      </Space.Compact>

      <Table
        dataSource={clients}
        columns={columns.map((c) => ({
          ...c,
          onHeaderCell: () => ({ style: { whiteSpace: "nowrap" as const } }),
        }))}
        rowKey="client_id"
        loading={loading}
        size="small"
        pagination={{
          position: ["bottomRight"],
          defaultPageSize: 10,
          showSizeChanger: true,
        }}
        expandable={{ expandedRowRender }}
      />

      <Modal
        title={isCreate ? "Register New OAuth2 Client" : "Edit OAuth2 Client"}
        open={modalOpen}
        onCancel={closeModal}
        onOk={() => form.submit()}
        okText={isCreate ? "Create" : "Save"}
        forceRender
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            name="name"
            label="Application Name"
            rules={[{ required: true, message: "Name is required" }]}
          >
            <Input placeholder="My Application" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea
              rows={2}
              placeholder="Brief description of this application"
            />
          </Form.Item>
          <Form.Item
            name="mode"
            label="Client Mode"
            tooltip="Web: server-side apps with HTTPS redirects. Native: desktop/CLI apps with localhost redirects (any port, per RFC 8252)."
          >
            <Radio.Group
              onChange={(e) => {
                if (e.target.value === "native") {
                  const cur = form.getFieldValue("redirect_uris");
                  if (!cur || cur.trim() === "" || cur.includes("example.com")) {
                    form.setFieldValue(
                      "redirect_uris",
                      "http://localhost/authorize/",
                    );
                  }
                }
              }}
            >
              <Radio.Button value="web">Web</Radio.Button>
              <Radio.Button value="native">Native / Local</Radio.Button>
            </Radio.Group>
          </Form.Item>
          <Form.Item
            name="redirect_uris"
            label="Redirect URIs (one per line)"
            rules={[
              { required: true, message: "At least one redirect URI required" },
            ]}
            tooltip="Web: must be HTTPS. Native: http://localhost/path — any port is accepted per RFC 8252."
          >
            <Input.TextArea
              rows={3}
              placeholder="https://example.com/callback"
            />
          </Form.Item>
          <Form.Item
            name="scopes"
            label="Scopes"
            tooltip="Select predefined scopes or type api:project:{UUID} to restrict access to specific projects."
          >
            <Select
              mode="tags"
              allowClear
              style={{ width: "100%" }}
              placeholder="Select or type scopes (e.g. api:project:UUID)"
              options={SCOPE_OPTIONS}
            />
          </Form.Item>
          {!isCreate && (
            <Form.Item name="active" label="Active" valuePropName="checked">
              <Switch />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
}
