/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Modal, Radio, Space, message } from "antd";
import useAsyncEffect from "use-async-effect";
import * as immutable from "immutable";
import React, { useMemo, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { Button, ButtonToolbar } from "@cocalc/frontend/antd-bootstrap";
import { Gap, Icon } from "@cocalc/frontend/components";
import { useStudentProjectFunctionality } from "@cocalc/frontend/course";
import { CustomSoftwareInfo } from "@cocalc/frontend/custom-software/info-bar";
import { type ComputeImages } from "@cocalc/frontend/custom-software/init";
import { IS_MOBILE } from "@cocalc/frontend/feature";
import { labels } from "@cocalc/frontend/i18n";
import { type ProjectActions } from "@cocalc/frontend/project_store";
import * as misc from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { DirectoryListingEntry } from "@cocalc/util/types";
import {
  ACTION_BUTTONS_DIR,
  ACTION_BUTTONS_FILE,
  ACTION_BUTTONS_MULTI,
} from "@cocalc/frontend/project/explorer/action-utils";
import { FileActionsDropdown } from "@cocalc/frontend/project/explorer/file-actions-dropdown";
import {
  BACKUPS,
  type BackupMeta,
  isBackupsPath,
} from "@cocalc/frontend/project/listing/use-backups";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import path from "path";

const ROW_INFO_STYLE = {
  color: COLORS.TAB,
  height: "22px",
  margin: "5px 3px",
} as const;

interface Props {
  project_id?: string;
  checked_files: immutable.Set<string>;
  listing: DirectoryListingEntry[];
  current_path?: string;
  project_map?;
  images?: ComputeImages;
  actions: ProjectActions;
  available_features?;
  show_custom_software_reset?: boolean;
  project_is_running?: boolean;
  refreshBackups?: () => void;
}

export function ActionBar({
  project_id,
  checked_files,
  listing,
  current_path,
  project_map,
  images,
  actions,
  available_features,
  show_custom_software_reset,
  project_is_running,
  refreshBackups,
}: Props) {
  const intl = useIntl();
  const currentParts = (current_path ?? "").split("/").filter(Boolean);
  const inBackups =
    current_path != null && isBackupsPath(current_path ?? "") ? true : false;
  const student_project_functionality = useStudentProjectFunctionality(
    actions.project_id,
  );
  if (student_project_functionality.disableActions) {
    return <div></div>;
  }

  const [backupsMeta, setBackupsMeta] = useState<BackupMeta[] | null>(null);
  const [backupsLoading, setBackupsLoading] = useState<boolean>(false);
  const [backupsErr, setBackupsErr] = useState<any>(null);
  const [backupsTick, setBackupsTick] = useState(0);

  useAsyncEffect(async () => {
    if (!inBackups || !project_id) return;
    try {
      setBackupsLoading(true);
      setBackupsErr(null);
      const backups = await webapp_client.conat_client.hub.projects.getBackups({
        project_id,
        indexed_only: true,
      });
      setBackupsMeta(
        backups.map(({ id, time }) => ({
          id,
          name: new Date(time).toISOString(),
          mtime: new Date(time).getTime(),
        })),
      );
    } catch (err) {
      setBackupsErr(err);
    } finally {
      setBackupsLoading(false);
    }
  }, [inBackups, project_id, current_path, backupsTick]);

  interface BackupSelection {
    id: string;
    name: string;
    paths: string[];
  }

  async function performRestore() {
    if (!project_id) return;
    const entries = (backupContext as any).entries as BackupSelection[];
    if (!entries || entries.length === 0) return;
    try {
      setRestoreLoading(true);
      setRestoreError(null);
      for (const entry of entries) {
        for (const rel of entry.paths) {
          const dest =
            restoreMode === "scratch"
              ? path.posix.join("/scratch", rel || "")
              : undefined;
          const op = await webapp_client.conat_client.hub.projects.restoreBackup({
            project_id,
            id: entry.id,
            path: rel || undefined,
            dest,
          });
          actions?.trackRestoreOp?.(op);
        }
      }
      message.success("Restore started");
      actions?.open_directory?.(current_path, false);
      setRestoreOpen(false);
    } catch (err) {
      setRestoreError(err);
    } finally {
      setRestoreLoading(false);
    }
  }

  const backupContext = useMemo(() => {
    if (!inBackups) return { mode: "none" as const, entries: [] as any[] };
    if (backupsLoading)
      return { mode: "loading" as const, entries: [] as BackupSelection[] };
    if (backupsErr)
      return { mode: "error" as const, entries: [], err: backupsErr };
    if (!backupsMeta)
      return { mode: "loading" as const, entries: [] as BackupSelection[] };
    if (currentParts.length === 0 || currentParts[0] !== BACKUPS) {
      return { mode: "none" as const, entries: [] as BackupSelection[] };
    }

    const findBackup = (name: string) =>
      backupsMeta.find(
        (b) => b.name === name || b.id === name || b.id.startsWith(name),
      );

    if (currentParts.length === 1) {
      const names = Array.from(checked_files)
        .filter((p) => p.startsWith(`${BACKUPS}/`))
        .map((p) => p.slice(BACKUPS.length + 1).split("/")[0])
        .filter(Boolean);
      const entries: BackupSelection[] = [];
      for (const name of new Set(names)) {
        const backup = findBackup(name);
        if (backup) {
          entries.push({ id: backup.id, name: backup.name, paths: [""] });
        }
      }
      return { mode: "root" as const, entries };
    }

    const backupName = currentParts[1];
    const backup = findBackup(backupName);
    if (!backup) {
      return {
        mode: "error" as const,
        entries: [],
        err: new Error(`backup '${backupName}' not found`),
      };
    }
    const subpath = currentParts.slice(2).join("/");
    const selected = Array.from(checked_files)
      .filter(
        (p) => p === current_path || p.startsWith(`${current_path ?? ""}/`),
      )
      .map((p) =>
        p === current_path
          ? ""
          : p.slice((current_path?.length ?? 0) + 1).replace(/^\/+/, ""),
      )
      .filter(Boolean);
    const paths =
      selected.length === 0
        ? [subpath]
        : selected.map((name) =>
            subpath ? path.posix.join(subpath, name) : name,
          );
    return {
      mode: "inside" as const,
      entries: [{ id: backup.id, name: backup.name, paths }],
    };
  }, [
    inBackups,
    backupsLoading,
    backupsErr,
    backupsMeta,
    currentParts,
    checked_files,
    current_path,
  ]);

  const [restoreOpen, setRestoreOpen] = useState<boolean>(false);
  const [restoreMode, setRestoreMode] = useState<"same" | "scratch">("same");
  const [restoreLoading, setRestoreLoading] = useState<boolean>(false);
  const [restoreError, setRestoreError] = useState<any>(null);

  function clear_selection(): void {
    actions.set_all_files_unchecked();
  }

  function check_all_click_handler(): void {
    if (checked_files.size === 0) {
      actions.set_file_list_checked(
        listing.map((file) => misc.path_to_file(current_path ?? "", file.name)),
      );
    } else {
      clear_selection();
    }
  }

  function render_check_all_button(): React.JSX.Element | undefined {
    if (listing.length === 0) {
      return;
    }

    const checked = checked_files.size > 0;
    const button_text = intl.formatMessage(
      {
        id: "project.explorer.action-bar.check_all.button",
        defaultMessage: `{checked, select, true {Uncheck All} other {Check All}}`,
        description:
          "For checking all checkboxes to select all files in a listing.",
      },
      { checked },
    );

    let button_icon;
    if (checked_files.size === 0) {
      button_icon = "square-o";
    } else {
      if (checked_files.size >= listing.length) {
        button_icon = "check-square-o";
      } else {
        button_icon = "minus-square-o";
      }
    }

    return (
      <Button
        bsSize="small"
        cocalc-test="check-all"
        onClick={check_all_click_handler}
      >
        <Icon name={button_icon} /> {button_text}
      </Button>
    );
  }

  function render_currently_selected(): React.JSX.Element | undefined {
    if (listing.length === 0) {
      return;
    }
    const checked = checked_files.size;
    const total = listing.length;
    const style = ROW_INFO_STYLE;

    if (checked === 0) {
      return (
        <div style={style}>
          <span>
            {total} {intl.formatMessage(labels.item_plural, { total })}
          </span>
          <div style={{ display: "inline" }}>
            {" "}
            &mdash;{" "}
            <FormattedMessage
              id="project.explorer.action-bar.currently_selected.info"
              defaultMessage={
                "Click the checkbox to the left of a file to copy, download, etc."
              }
            />
          </div>
        </div>
      );
    } else {
      return (
        <div style={style}>
          <span>
            {intl.formatMessage(
              {
                id: "project.explorer.action-bar.currently_selected.items",
                defaultMessage: "{checked} of {total} {items} selected",
              },
              {
                checked,
                total,
                items: intl.formatMessage(labels.item_plural, { total }),
              },
            )}
          </span>
          <Gap />
        </div>
      );
    }
  }

  const backupEntries = (backupContext as any).entries as BackupSelection[];
  const restoreDisabled =
    !inBackups ||
    backupsLoading ||
    !backupEntries ||
    backupEntries.length === 0 ||
    backupContext.mode === "error";
  const deleteDisabled = !(
    inBackups &&
    currentParts.length === 1 &&
    backupEntries &&
    backupEntries.length > 0
  );

  async function deleteBackups() {
    if (!project_id) return;
    if (deleteDisabled) return;
    try {
      for (const entry of backupEntries) {
        await webapp_client.conat_client.hub.projects.deleteBackup({
          project_id,
          id: entry.id,
        });
      }
      message.success("Backup deleted");
      // Force a refresh and clear selection so the listing updates immediately.
      actions?.set_all_files_unchecked?.();
      refreshBackups?.();
      setBackupsTick((value) => value + 1);
      actions?.open_directory?.(current_path, true);
    } catch (err) {
      message.error(`${err}`);
    }
  }

  function renderRestoreModal() {
    if (!restoreOpen) return null;
    const paths =
      backupEntries?.flatMap((e) =>
        e.paths.map((p) => (p ? `${e.name}:${p}` : `${e.name} (all files)`)),
      ) ?? [];
    return (
      <Modal
        title={
          <>
            <Icon name="undo" /> Restore from backup
          </>
        }
        open={restoreOpen}
        onCancel={() => setRestoreOpen(false)}
        onOk={performRestore}
        confirmLoading={restoreLoading}
        okText="Restore"
      >
        <p>Select where to restore the selected files.</p>
        <Radio.Group
          value={restoreMode}
          onChange={(e) => setRestoreMode(e.target.value)}
          style={{ display: "flex", flexDirection: "column", gap: 8 }}
        >
          <Radio value="same">Restore to original paths (overwrite)</Radio>
          <Radio value="scratch">Restore to /scratch/&lt;path&gt;</Radio>
        </Radio.Group>
        {paths && paths.length > 0 && (
          <ul style={{ marginTop: "10px" }}>
            {paths.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        {restoreError && (
          <div style={{ color: "red", marginTop: "8px" }}>{`${restoreError}`}</div>
        )}
      </Modal>
    );
  }

  function render_backup_actions(): React.JSX.Element | undefined {
    if (checked_files.size === 0) {
      return;
    }
    return (
      <Space.Compact>
        <Button
          onClick={() => setRestoreOpen(true)}
          disabled={restoreDisabled}
          title={
            backupContext.mode === "error"
              ? `${backupContext.err}`
              : restoreDisabled
                ? "Select backup items to restore"
                : undefined
          }
        >
          <Icon name="undo" /> Restore
        </Button>
        <Button
          disabled={deleteDisabled}
          onClick={() => {
            if (deleteDisabled) return;
            const names =
              backupEntries
                ?.map((e) => e.name)
                .filter(Boolean)
                .sort() ?? [];
            Modal.confirm({
              title: "Delete selected backups?",
              content:
                names.length > 0 ? (
                  <div>
                    <p>This will permanently remove:</p>
                    <ul style={{ paddingLeft: "20px" }}>
                      {names.map((n) => (
                        <li key={n}>{n}</li>
                      ))}
                    </ul>
                  </div>
                ) : null,
              okText: "Delete",
              cancelText: "Cancel",
              onOk: deleteBackups,
            });
          }}
        >
          <Icon name="trash" /> Delete
        </Button>
        {renderRestoreModal()}
      </Space.Compact>
    );
  }

  function render_action_buttons(): React.JSX.Element | undefined {
    if (inBackups) {
      return render_backup_actions();
    }
    let action_buttons: (
      | "download"
      | "compress"
      | "delete"
      | "rename"
      | "duplicate"
      | "move"
      | "copy"
      | "share"
    )[];
    if (checked_files.size === 0) {
      return;
    } else if (checked_files.size === 1) {
      let isDir;
      const item = checked_files.first();
      for (const file of listing) {
        if (misc.path_to_file(current_path ?? "", file.name) === item) {
          ({ isDir } = file);
        }
      }

      if (isDir) {
        // one directory selected
        action_buttons = [...ACTION_BUTTONS_DIR];
      } else {
        // one file selected
        action_buttons = [...ACTION_BUTTONS_FILE];
      }
    } else {
      // multiple items selected
      action_buttons = [...ACTION_BUTTONS_MULTI];
    }
    return (
      <FileActionsDropdown
        names={action_buttons}
        current_path={current_path}
        actions={actions}
        label="Actions"
      />
    );
  }

  function render_button_area(): React.JSX.Element | undefined {
    if (checked_files.size === 0) {
      if (
        project_id == null ||
        images == null ||
        project_map == null ||
        available_features == null
      ) {
        return;
      }
      return (
        <Space.Compact>
          <CustomSoftwareInfo
            project_id={project_id}
            images={images}
            project_map={project_map}
            actions={actions}
            available_features={available_features}
            show_custom_software_reset={!!show_custom_software_reset}
            project_is_running={!!project_is_running}
          />
        </Space.Compact>
      );
    } else {
      return render_action_buttons();
    }
  }
  if (checked_files.size === 0 && IS_MOBILE) {
    return null;
  }
  return (
    <div style={{ flex: "1 0 auto" }}>
      <div style={{ flex: "1 0 auto" }}>
        <ButtonToolbar style={{ whiteSpace: "nowrap", padding: "0" }}>
          <Space.Compact>{render_check_all_button()}</Space.Compact>
          {render_button_area()}
        </ButtonToolbar>
      </div>
      <div style={{ flex: "1 0 auto" }}>{render_currently_selected()}</div>
    </div>
  );
}
