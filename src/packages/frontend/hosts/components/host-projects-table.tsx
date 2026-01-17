import { Button, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { React } from "@cocalc/frontend/app-framework";
import type { Host, HostProjectRow } from "@cocalc/conat/hub/api/hosts";
import { useHostProjects } from "../hooks/use-host-projects";

function formatDate(value?: string | null): string {
  if (!value) return "n/a";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "n/a";
  return date.toLocaleString();
}

function needsBackupLabel(row: HostProjectRow) {
  if (!row.needs_backup) return "ok";
  if (row.state === "running" || row.state === "starting") return "running";
  return "needs backup";
}

type Props = {
  host: Host;
  riskOnly?: boolean;
  pageSize?: number;
  compact?: boolean;
  showSummary?: boolean;
  showControls?: boolean;
};

export function HostProjectsTable({
  host,
  riskOnly = false,
  pageSize = 200,
  compact = false,
  showSummary = true,
  showControls = true,
}: Props) {
  const {
    rows,
    summary,
    nextCursor,
    hostLastSeen,
    loading,
    loadingMore,
    error,
    refresh,
    loadMore,
  } = useHostProjects({
    hostId: host.id,
    riskOnly,
    limit: pageSize,
    enabled: !!host?.id,
  });

  const columns: ColumnsType<any> = React.useMemo(() => {
    const base: ColumnsType<any> = [
      {
        title: "Title",
        dataIndex: "title",
        key: "title",
        render: (_title, row) => (
          <Space direction="vertical" size={0}>
            <Typography.Text ellipsis style={{ maxWidth: 240 }}>
              {row.title || row.project_id}
            </Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              {row.project_id}
            </Typography.Text>
          </Space>
        ),
      },
      {
        title: "State",
        dataIndex: "state",
        key: "state",
        width: 110,
        render: (value) => value || "off",
      },
      {
        title: "Provisioned",
        dataIndex: "provisioned",
        key: "provisioned",
        width: 110,
        render: (value) =>
          value == null ? (
            <Tag>unknown</Tag>
          ) : value ? (
            <Tag color="green">yes</Tag>
          ) : (
            <Tag color="default">no</Tag>
          ),
      },
      {
        title: "Last edited",
        dataIndex: "last_edited",
        key: "last_edited",
        width: 160,
        render: (value) => formatDate(value),
      },
      {
        title: "Last backup",
        dataIndex: "last_backup",
        key: "last_backup",
        width: 160,
        render: (value) => formatDate(value),
      },
      {
        title: "Backup",
        dataIndex: "needs_backup",
        key: "needs_backup",
        width: 120,
        render: (_value, row) => {
          const label = needsBackupLabel(row);
          return label === "ok" ? (
            <Tag color="green">ok</Tag>
          ) : label === "running" ? (
            <Tag color="orange">running</Tag>
          ) : (
            <Tag color="red">needs backup</Tag>
          );
        },
      },
      {
        title: "Collabs",
        dataIndex: "collab_count",
        key: "collab_count",
        width: 90,
      },
    ];

    if (compact) {
      return base.filter((col) =>
        ["title", "state", "last_edited", "last_backup", "needs_backup"].includes(
          String(col.key),
        ),
      );
    }
    return base;
  }, [compact]);

  const summaryLabel = React.useMemo(() => {
    if (!summary) return null;
    const total = summary.total ?? 0;
    const provisioned = summary.provisioned ?? 0;
    const running = summary.running ?? 0;
    const upToDate = summary.provisioned_up_to_date ?? 0;
    const needs = summary.provisioned_needs_backup ?? 0;
    const counts = `Assigned ${total} · Provisioned ${provisioned} · Running ${running} · Backed up ${upToDate}/${provisioned}`;
    const risks = needs + running;
    return risks > 0 ? `${counts} · Needs backup ${risks}` : counts;
  }, [summary]);

  return (
    <Space direction="vertical" style={{ width: "100%" }} size="small">
      {showSummary && summaryLabel && (
        <Typography.Text type="secondary">{summaryLabel}</Typography.Text>
      )}
      {showSummary && hostLastSeen && (
        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
          Last seen: {formatDate(hostLastSeen)}
        </Typography.Text>
      )}
      {error && (
        <Typography.Text type="danger">{error}</Typography.Text>
      )}
      <Table
        size="small"
        rowKey="project_id"
        dataSource={rows}
        columns={columns}
        loading={loading}
        pagination={false}
        scroll={{ y: compact ? 240 : 420 }}
        locale={{
          emptyText: loading ? "Loading…" : "No projects found.",
        }}
      />
      {showControls && (
        <Space>
          <Button size="small" onClick={refresh} disabled={loading}>
            Refresh
          </Button>
          {nextCursor && (
            <Button size="small" onClick={loadMore} loading={loadingMore}>
              Load more
            </Button>
          )}
        </Space>
      )}
    </Space>
  );
}
