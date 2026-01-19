import { Icon } from "@cocalc/frontend/components";
import { TimeAgo } from "@cocalc/frontend/components/time-ago";
import { file_associations } from "@cocalc/frontend/file-associations";
import { filename_extension, trunc_middle, human_readable_size } from "@cocalc/util/misc";

export function FindPathRow({
  path,
  onClick,
  isSelected = false,
}: {
  path: string;
  onClick: (e: React.MouseEvent) => void | Promise<void>;
  isSelected?: boolean;
}) {
  const ext = filename_extension(path);
  const icon = file_associations[ext]?.icon ?? "file";
  return (
    <div
      role="button"
      style={{
        padding: "6px 8px",
        cursor: "pointer",
        borderBottom: "1px solid #f0f0f0",
        background: isSelected ? "#e6f7ff" : undefined,
      }}
      onClick={onClick}
    >
      <Icon name={icon} style={{ marginRight: "6px" }} />
      <span>{trunc_middle(path, 80)}</span>
    </div>
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
}: {
  result: SnapshotResult;
  onClick: (e: React.MouseEvent) => void | Promise<void>;
  isSelected?: boolean;
}) {
  const ext = filename_extension(result.path);
  const icon = file_associations[ext]?.icon ?? "file";
  return (
    <div
      role="button"
      style={{
        padding: "6px 8px",
        cursor: "pointer",
        borderBottom: "1px solid #f0f0f0",
        background: isSelected ? "#e6f7ff" : undefined,
      }}
      onClick={onClick}
    >
      <div>
        <Icon name={icon} style={{ marginRight: "6px" }} />
        <strong>{trunc_middle(result.path || "(root)", 70)}</strong>
      </div>
      <div style={{ fontSize: "12px", color: "#666" }}>
        Snapshot: {result.snapshot}
        {result.line_number != null ? ` · line ${result.line_number}` : ""}
      </div>
      {result.mtime != null || result.size != null ? (
        <div style={{ fontSize: "12px", color: "#666" }}>
          {result.mtime != null ? (
            <>
              Modified <TimeAgo date={new Date(result.mtime)} />
            </>
          ) : null}
          {result.mtime != null && result.size != null ? " · " : null}
          {result.size != null && !result.isDir
            ? `Size ${human_readable_size(result.size)}`
            : null}
        </div>
      ) : null}
      {result.description ? (
        <div style={{ fontSize: "12px", color: "#666" }}>
          {result.description}
        </div>
      ) : null}
    </div>
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
}: {
  result: BackupResult;
  onClick: () => void;
  isSelected?: boolean;
}) {
  return (
    <div
      role="button"
      style={{
        padding: "6px 8px",
        cursor: "pointer",
        borderBottom: "1px solid #f0f0f0",
        background: isSelected ? "#e6f7ff" : undefined,
      }}
      onClick={onClick}
    >
      <div>
        <Icon
          name={result.isDir ? "folder-open" : "file"}
          style={{ marginRight: "6px" }}
        />
        <strong>{trunc_middle(result.path || "(root)", 70)}</strong>
      </div>
      <div style={{ fontSize: "12px", color: "#666" }}>
        Backup <TimeAgo date={new Date(result.time)} />
      </div>
      <div style={{ fontSize: "12px", color: "#666" }}>
        {result.mtime != null ? (
          <>
            Modified <TimeAgo date={new Date(result.mtime)} />
          </>
        ) : null}
        {result.mtime != null ? " · " : null}
        {result.size != null && !result.isDir
          ? `Size ${human_readable_size(result.size)}`
          : null}
      </div>
    </div>
  );
}
