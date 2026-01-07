/*
 * My Launchpad licenses (software licenses).
 */

import { Button, Table, Typography } from "antd";
import dayjs from "dayjs";

import { React } from "@cocalc/frontend/app-framework";
import { ErrorDisplay, Loading } from "@cocalc/frontend/components";
import CopyToClipBoard from "@cocalc/frontend/components/copy-to-clipboard";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import type { SoftwareLicense } from "@cocalc/util/db-schema/software-licenses";

const { Paragraph, Title, Text } = Typography;

function formatShortId(value?: string) {
  if (!value) return "";
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

export function SoftwareLicensesPage() {
  const hub = webapp_client.conat_client.hub;
  const [licenses, setLicenses] = React.useState<SoftwareLicense[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string>("");

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const list = await hub.software.listMyLicenses({});
      setLicenses(list ?? []);
      setError("");
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [hub]);

  React.useEffect(() => {
    load();
  }, [load]);

  const columns = [
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
      title: "Created",
      dataIndex: "created",
      render: (value) =>
        value ? dayjs(value).format("YYYY-MM-DD") : "—",
    },
    {
      title: "Expires",
      dataIndex: "expires_at",
      render: (value) =>
        value ? dayjs(value).format("YYYY-MM-DD") : "—",
    },
    {
      title: "Status",
      dataIndex: "revoked_at",
      render: (value) => (value ? "revoked" : "active"),
    },
    {
      title: "Token",
      dataIndex: "token",
      render: (value) =>
        value ? (
          <CopyToClipBoard value={value} display="Copy token" />
        ) : (
          <Text type="secondary">not available</Text>
        ),
    },
  ];

  return (
    <div style={{ marginTop: "24px" }}>
      <Title level={4}>My Launchpad Licenses</Title>
      <Paragraph type="secondary">
        Use these licenses to activate CoCalc Launchpad instances. Keep tokens
        private.
      </Paragraph>
      {error && <ErrorDisplay error={error} />}
      {loading && <Loading theme="medium" />}
      <Button onClick={load} style={{ marginBottom: 12 }}>
        Refresh
      </Button>
      <Table
        size="small"
        dataSource={licenses.map((license) => ({
          key: license.id,
          ...license,
        }))}
        columns={columns}
        pagination={false}
      />
      {!loading && licenses.length === 0 && (
        <Paragraph type="secondary">No Launchpad licenses yet.</Paragraph>
      )}
    </div>
  );
}
