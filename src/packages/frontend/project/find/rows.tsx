import { TimeAgo } from "@cocalc/frontend/components/time-ago";
import type { ReactNode } from "react";
import { human_readable_size } from "@cocalc/util/misc";
import { FindResultCard, stripLineNumbers } from "./result-card";

export function FindPathRow({
  path,
  onClick,
  isSelected = false,
  actions,
}: {
  path: string;
  onClick: (e: React.MouseEvent) => void | Promise<void>;
  isSelected?: boolean;
  actions?: React.ReactNode;
}) {
  return (
    <FindResultCard
      title={path}
      onClick={onClick}
      isSelected={isSelected}
      actions={actions}
      titleClampLines={2}
      titleMinLines={2}
    />
  );
}

export type SnapshotResult = {
  snapshot: string;
  path: string;
  line_number?: number;
  description?: string;
  filter: string;
  mtime?: number;
  size?: number;
  isDir?: boolean;
};

export function FindSnapshotRow({
  result,
  onClick,
  isSelected = false,
  actions,
}: {
  result: SnapshotResult;
  onClick: (e: React.MouseEvent) => void | Promise<void>;
  isSelected?: boolean;
  actions?: React.ReactNode;
}) {
  const snapshotDate = new Date(result.snapshot);
  const snapshotSubtitle = Number.isNaN(snapshotDate.getTime())
    ? `Snapshot ${result.snapshot}`
    : undefined;
  const meta: ReactNode[] = [];
  if (result.line_number != null) {
    meta.push(`Line ${result.line_number}`);
  }
  if (result.mtime != null || result.size != null) {
    const parts: ReactNode[] = [];
    if (result.mtime != null) {
      parts.push(
        <>
          Modified <TimeAgo date={new Date(result.mtime)} />
        </>,
      );
    }
    if (result.size != null && !result.isDir) {
      parts.push(`Size ${human_readable_size(result.size)}`);
    }
    if (parts.length) {
      meta.push(
        <>
          {parts.map((part, idx) => (
            <span key={idx}>
              {part}
              {idx < parts.length - 1 ? " · " : null}
            </span>
          ))}
        </>,
      );
    }
  }
  return (
    <FindResultCard
      title={result.path || "(root)"}
      subtitle={
        result.snapshot ? (
          snapshotSubtitle ?? (
            <>
              Snapshot <TimeAgo date={snapshotDate} />
            </>
          )
        ) : undefined
      }
      meta={meta}
      snippet={result.description}
      snippetExt={result.path}
      titleClampLines={2}
      titleMinLines={2}
      metaMinLines={2}
      copyValue={
        result.description ? stripLineNumbers(result.description) : undefined
      }
      onClick={onClick}
      isSelected={isSelected}
      actions={actions}
    />
  );
}

export type BackupResult = {
  id: string;
  time: Date;
  path: string;
  isDir: boolean;
  mtime: number;
  size: number;
  filter: string;
};

export function FindBackupRow({
  result,
  onClick,
  isSelected = false,
  actions,
}: {
  result: BackupResult;
  onClick: () => void;
  isSelected?: boolean;
  actions?: React.ReactNode;
}) {
  const meta: ReactNode[] = [];
  if (result.mtime != null || result.size != null) {
    const parts: ReactNode[] = [];
    if (result.mtime != null) {
      parts.push(
        <>
          Modified <TimeAgo date={new Date(result.mtime)} />
        </>,
      );
    }
    if (result.size != null && !result.isDir) {
      parts.push(`Size ${human_readable_size(result.size)}`);
    }
    if (parts.length) {
      meta.push(
        <>
          {parts.map((part, idx) => (
            <span key={idx}>
              {part}
              {idx < parts.length - 1 ? " · " : null}
            </span>
          ))}
        </>,
      );
    }
  }
  return (
    <FindResultCard
      title={result.path || "(root)"}
      subtitle={
        result.time ? (
          <>
            Backup <TimeAgo date={new Date(result.time)} />
          </>
        ) : undefined
      }
      meta={meta}
      titleClampLines={2}
      titleMinLines={2}
      metaMinLines={1}
      onClick={onClick}
      isSelected={isSelected}
      actions={actions}
    />
  );
}
