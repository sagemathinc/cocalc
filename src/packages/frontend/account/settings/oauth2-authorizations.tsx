/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// User-facing list of OAuth2 applications that have been authorized
// to access this account, with the ability to revoke access.

import { Alert, Button, Popconfirm, Table, Tag, Typography } from "antd";
import { useCallback, useEffect, useState } from "react";

import { DeleteOutlined, ReloadOutlined } from "@ant-design/icons";
import {
  A,
  ErrorDisplay,
  SettingBox,
  TimeAgo,
} from "@cocalc/frontend/components";
import Copyable from "@cocalc/frontend/components/copy-to-clipboard";
import api from "@cocalc/frontend/client/api";
import { COLORS } from "@cocalc/util/theme";

const { Paragraph, Text } = Typography;

interface Authorization {
  client_id: string;
  name: string;
  description: string;
  mode: "web" | "native";
  active_access_tokens: number;
  active_refresh_tokens: number;
  last_used: string | null;
  scope: string | null;
  device_name: string | null;
}

export default function OAuth2Authorizations() {
  const [authorizations, setAuthorizations] = useState<Authorization[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [defaultNativeClientId, setDefaultNativeClientId] = useState("");
  const [host, setHost] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api("oauth2/my-authorizations");
      if (result.error) {
        setError(result.error);
      } else {
        setAuthorizations(result.authorizations ?? []);
        setDefaultNativeClientId(result.default_native_client_id ?? "");
        setHost(result.host ?? "");
      }
    } catch (err) {
      setError(`${err}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleRevoke = async (clientId: string) => {
    setError("");
    try {
      const result = await api("oauth2/my-authorizations", {
        action: "revoke",
        client_id: clientId,
      });
      if (result.error) {
        setError(result.error);
      }
      await load();
    } catch (err) {
      setError(`${err}`);
    }
  };

  const columns = [
    {
      title: "Application",
      key: "name",
      render: (_: unknown, record: Authorization) => (
        <span>
          <strong>{record.name}</strong>{" "}
          <Tag color={record.mode === "native" ? "green" : "blue"}>
            {record.mode ?? "web"}
          </Tag>
        </span>
      ),
    },
    {
      title: "Device",
      dataIndex: "device_name",
      key: "device_name",
      width: 120,
      render: (name: string | null) => name || "—",
    },
    {
      title: "Scopes",
      key: "scope",
      render: (_: unknown, record: Authorization) =>
        record.scope
          ? record.scope.split(" ").map((s) => (
              <Tag key={s} style={{ marginBottom: 2 }}>
                {s}
              </Tag>
            ))
          : "—",
    },
    {
      title: "Last Used",
      key: "last_used",
      width: 140,
      render: (_: unknown, record: Authorization) =>
        record.last_used ? <TimeAgo date={record.last_used} /> : "never",
    },
    {
      title: "",
      key: "actions",
      width: 100,
      render: (_: unknown, record: Authorization) => (
        <Popconfirm
          title="Revoke access?"
          description={`${record.name} will no longer be able to access your account.`}
          onConfirm={() => handleRevoke(record.client_id)}
        >
          <Button type="text" size="small" danger icon={<DeleteOutlined />}>
            Revoke
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <SettingBox title="Authorized Applications" icon="unlock">
      <Paragraph style={{ color: COLORS.GRAY_M }}>
        OAuth2 applications that have been authorized to access your CoCalc
        account. You can revoke access at any time.
      </Paragraph>

      {error && (
        <ErrorDisplay
          error={error}
          onClose={() => setError("")}
          style={{ marginBottom: 12 }}
        />
      )}

      <Button
        size="small"
        icon={<ReloadOutlined />}
        onClick={load}
        loading={loading}
        style={{ marginBottom: 12 }}
      >
        Refresh
      </Button>

      <Table
        dataSource={authorizations}
        columns={columns}
        rowKey="client_id"
        loading={loading}
        size="small"
        pagination={false}
        locale={{ emptyText: "No applications are currently authorized." }}
      />

      {defaultNativeClientId && (
        <Alert
          type="info"
          showIcon
          style={{ marginTop: 16 }}
          message={
            <span>
              Access CoCalc programmatically using{" "}
              <A href="https://pypi.org/project/cocalc-api/">
                <Text code>cocalc-api</Text>
              </A>
            </span>
          }
          description={
            <Copyable
              value={`uvx cocalc-api@latest auth login${host ? ` --host ${host}` : ""} --client-id ${defaultNativeClientId}`}
              inputWidth="100%"
              size="small"
              style={{ width: "100%" }}
              inputStyle={{ textOverflow: "ellipsis" }}
              outerStyle={{ width: "100%" }}
            />
          }
        />
      )}
    </SettingBox>
  );
}
