import { Typography } from "antd";
import type { Host } from "@cocalc/conat/hub/api/hosts";

function formatBackupStatus(host: Host, compact: boolean): string | null {
  const status = host.backup_status;
  if (!status) return null;
  const total = status.total ?? 0;
  if (!total) return null;
  const upToDate = status.up_to_date ?? 0;
  const running = status.running ?? 0;
  const needs = (status.needs_backup ?? 0) + running;
  if (compact) {
    return `Backups ${upToDate}/${total}`;
  }
  const detail =
    needs > 0
      ? ` · needs ${needs}${running ? ` (running ${running})` : ""}`
      : "";
  return `Backups: ${upToDate}/${total} up to date${detail}`;
}

export function HostBackupStatus({
  host,
  compact = false,
}: {
  host: Host;
  compact?: boolean;
}) {
  const label = formatBackupStatus(host, compact);
  if (!label) return null;
  return (
    <Typography.Text type="secondary" style={{ fontSize: 11 }}>
      {label}
    </Typography.Text>
  );
}
