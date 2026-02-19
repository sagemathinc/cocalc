/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Modal } from "antd";
import { useCallback, useState } from "react";
import { defineMessage, useIntl } from "react-intl";

import {
  project_redux_name,
  useActions,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { Icon, Text } from "@cocalc/frontend/components";
import ComputeServerTag from "@cocalc/frontend/compute/server-tag";
import { labels } from "@cocalc/frontend/i18n";
import { FILE_ACTIONS } from "@cocalc/frontend/project_actions";
import { path_split } from "@cocalc/util/misc";

import { useProjectContext } from "./context";
import { ActionBox } from "./explorer/action-box";

const MODAL_LABELS = {
  renameTitle: defineMessage({
    id: "project.file-action-modal.rename.title",
    defaultMessage: "Rename the file ''{filename}''",
    description:
      "Title of the modal dialog to rename a file in the file explorer",
  }),
  duplicateTitle: defineMessage({
    id: "project.file-action-modal.duplicate.title",
    defaultMessage: "Duplicate the file ''{filename}''",
    description:
      "Title of the modal dialog to duplicate a file in the file explorer",
  }),
  renameButton: defineMessage({
    id: "project.file-action-modal.rename.button",
    defaultMessage: "Rename File",
    description: "Button label to confirm renaming a file in the file explorer",
  }),
  duplicateButton: defineMessage({
    id: "project.file-action-modal.duplicate.button",
    defaultMessage: "Duplicate File",
    description:
      "Button label to confirm duplicating a file in the file explorer",
  }),
  deleteButton: defineMessage({
    id: "project.file-action-modal.delete.button",
    defaultMessage: "Delete {count, plural, one {# Item} other {# Items}}",
    description:
      "Button label to confirm deleting selected files in the file explorer",
  }),
  moveButton: defineMessage({
    id: "project.file-action-modal.move.button",
    defaultMessage: "Move {count, plural, one {# Item} other {# Items}}",
    description:
      "Button label to confirm moving selected files to another directory in the file explorer",
  }),
  copyButton: defineMessage({
    id: "project.file-action-modal.copy.button",
    defaultMessage: "Copy {count, plural, one {# Item} other {# Items}}",
    description:
      "Button label to confirm copying selected files to another location in the file explorer",
  }),
  compressButton: defineMessage({
    id: "project.file-action-modal.compress.button",
    defaultMessage: "Compress {count, plural, one {# Item} other {# Items}}",
    description:
      "Button label to confirm compressing selected files into a zip archive in the file explorer",
  }),
  downloadButton: defineMessage({
    id: "project.file-action-modal.download.button",
    defaultMessage: "Download",
    description:
      "Button label to download selected files from the file explorer to the user's computer",
  }),
  shareFinishedButton: defineMessage({
    id: "project.file-action-modal.share.finished.button",
    defaultMessage: "Finished",
    description:
      "Button label to close the share/publish dialog after configuring sharing options for a file",
  }),
  shareHint: defineMessage({
    id: "project.file-action-modal.share.hint",
    defaultMessage: "Changes are applied immediately.",
    description:
      "Hint in the share/publish dialog footer explaining that sharing changes take effect right away",
  }),
};

export default function FileActionModal() {
  const intl = useIntl();
  const { project_id } = useProjectContext();
  const actions = useActions({ project_id });

  const file_action = useTypedRedux({ project_id }, "file_action");
  const checked_files = useTypedRedux({ project_id }, "checked_files");
  const current_path = useTypedRedux({ project_id }, "current_path");
  const compute_server_id = useTypedRedux({ project_id }, "compute_server_id");
  const displayed_listing = useTypedRedux({ project_id }, "displayed_listing");

  const [actionLoading, setActionLoading] = useState(false);
  const onActionChange = useCallback((v: boolean) => setActionLoading(v), []);

  const isOpen = !!file_action && (checked_files?.size ?? 0) > 0;
  if (!isOpen || !actions) return null;

  const actionInfo = FILE_ACTIONS[file_action];
  if (!actionInfo) return null;

  const file_map = displayed_listing?.file_map;
  const renameFormId = `file-action-rename-form-${project_id}`;
  const selected_file =
    checked_files?.size === 1 ? checked_files.first() : undefined;
  const selected_tail = selected_file
    ? path_split(selected_file).tail
    : undefined;
  const title_text =
    file_action === "rename" && selected_tail
      ? intl.formatMessage(MODAL_LABELS.renameTitle, {
          filename: selected_tail,
        })
      : file_action === "duplicate" && selected_tail
        ? intl.formatMessage(MODAL_LABELS.duplicateTitle, {
            filename: selected_tail,
          })
        : intl.formatMessage(actionInfo.name);

  const title = (
    <span>
      <Icon name={actionInfo.icon ?? "exclamation-circle"} /> {title_text}
      {!!compute_server_id && (
        <ComputeServerTag
          id={compute_server_id}
          style={{ marginLeft: "10px" }}
        />
      )}
    </span>
  );

  // Copy, move, and share dialogs have complex multi-column layouts
  // (e.g. source/destination pickers, project selectors, sharing options),
  // so we need more screen real estate to show them properly.
  const isWideModal =
    file_action === "copy" || file_action === "move" || file_action === "share";
  const modalWidth = isWideModal
    ? file_action === "copy"
      ? "90vw"
      : "min(95vw, max(75vw, 900px))"
    : undefined;
  const modalStyle =
    file_action === "copy" ? { maxWidth: "1400px" } : undefined;

  const cancelButton = (
    <Button key="cancel" onClick={() => actions.set_file_action()}>
      {intl.formatMessage(labels.cancel)}
    </Button>
  );

  const itemCount = checked_files?.size ?? 0;

  function renderFooter(): React.ReactNode {
    if (!actions) return null;
    switch (file_action) {
      case "rename":
      case "duplicate":
        return [
          cancelButton,
          <Button
            key="submit"
            type="primary"
            htmlType="submit"
            form={renameFormId}
            loading={actionLoading}
          >
            {intl.formatMessage(
              file_action === "duplicate"
                ? MODAL_LABELS.duplicateButton
                : MODAL_LABELS.renameButton,
            )}
          </Button>,
        ];

      case "delete":
        return [
          cancelButton,
          <Button
            key="delete"
            danger
            type="primary"
            disabled={current_path === ".trash"}
            loading={actionLoading}
            onClick={async () => {
              const paths = checked_files?.toArray() ?? [];
              setActionLoading(true);
              try {
                const deleted = await actions.delete_files({ paths });
                if (!deleted) return;
                for (const path of paths) {
                  actions.close_tab(path);
                }
                actions.set_file_action();
                actions.set_all_files_unchecked();
                actions.fetch_directory_listing();
              } catch {
                // errors shown via set_activity
              } finally {
                setActionLoading(false);
              }
            }}
          >
            <Icon name="trash" />{" "}
            {intl.formatMessage(MODAL_LABELS.deleteButton, {
              count: itemCount,
            })}
          </Button>,
        ];

      case "move":
        return [
          cancelButton,
          <Button
            key="move"
            type="primary"
            htmlType="submit"
            form={`file-action-move-form-${project_id}`}
            loading={actionLoading}
          >
            <Icon name="move" />{" "}
            {intl.formatMessage(MODAL_LABELS.moveButton, {
              count: itemCount,
            })}
          </Button>,
        ];

      case "copy":
        return [
          cancelButton,
          <Button
            key="copy"
            type="primary"
            htmlType="submit"
            form={`file-action-copy-form-${project_id}`}
            loading={actionLoading}
          >
            <Icon name="files" />{" "}
            {intl.formatMessage(MODAL_LABELS.copyButton, {
              count: itemCount,
            })}
          </Button>,
        ];

      case "compress":
        return [
          cancelButton,
          <Button
            key="compress"
            type="primary"
            htmlType="submit"
            form={`file-action-compress-form-${project_id}`}
            loading={actionLoading}
          >
            <Icon name="compress" />{" "}
            {intl.formatMessage(MODAL_LABELS.compressButton, {
              count: itemCount,
            })}
          </Button>,
        ];

      case "download":
        return [
          cancelButton,
          <Button
            key="download"
            type="primary"
            htmlType="submit"
            form={`file-action-download-form-${project_id}`}
            loading={actionLoading}
          >
            <Icon name="cloud-download" />{" "}
            {intl.formatMessage(MODAL_LABELS.downloadButton)}
          </Button>,
        ];

      case "share":
        return [
          <Text
            key="hint"
            type="secondary"
            style={{ flex: 1, marginRight: 10 }}
          >
            {intl.formatMessage(MODAL_LABELS.shareHint)}
          </Text>,
          <Button
            key="finished"
            type="primary"
            onClick={() => actions.set_file_action()}
          >
            <Icon name="check" />{" "}
            {intl.formatMessage(MODAL_LABELS.shareFinishedButton)}
          </Button>,
        ];

      default:
        return null;
    }
  }

  return (
    <Modal
      open
      title={title}
      onCancel={() => actions.set_file_action()}
      footer={renderFooter()}
      destroyOnHidden
      width={modalWidth}
      style={modalStyle}
      styles={{
        body: {
          maxHeight: "72vh",
          overflowY: "auto",
          overflowX: "hidden",
        },
      }}
    >
      <ActionBox
        file_action={file_action}
        checked_files={checked_files}
        current_path={current_path}
        project_id={project_id}
        file_map={file_map}
        actions={actions}
        name={project_redux_name(project_id)}
        renameFormId={renameFormId}
        onActionChange={onActionChange}
      />
    </Modal>
  );
}
