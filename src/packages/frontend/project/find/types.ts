export type FindTab = "contents" | "files" | "snapshots" | "backups";

export type SnapshotSearchMode = "files" | "contents";

export type FindScopeMode = "current" | "home" | "git" | "custom";

export type FindPrefill = {
  tab: FindTab;
  query: string;
  scope_path?: string;
  submode?: string;
};

export type FindFilesState = {
  query: string;
  filter: string;
  subdirs: boolean;
  hidden: boolean;
  caseSensitive: boolean;
  respectIgnore: boolean;
};

export type FindSnapshotsState = {
  query: string;
  filter: string;
  mode: SnapshotSearchMode;
  hidden: boolean;
  caseSensitive: boolean;
  gitGrep: boolean;
  regexp: boolean;
};

export type FindBackupsState = {
  query: string;
  filter: string;
  mode: SnapshotSearchMode;
  caseSensitive: boolean;
};

export type FindScopeContext =
  | {
      kind: "backups";
      backupName?: string;
      innerPath: string;
      homePath: string;
    }
  | {
      kind: "snapshots";
      snapshotName?: string;
      innerPath: string;
      homePath: string;
    }
  | {
      kind: "normal";
      homePath: string;
    };
