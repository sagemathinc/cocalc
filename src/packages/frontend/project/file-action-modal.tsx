/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Modal } from "antd";
import { defineMessage, useIntl } from "react-intl";

import {
  project_redux_name,
  useActions,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
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
  }),
  duplicateTitle: defineMessage({
    id: "project.file-action-modal.duplicate.title",
    defaultMessage: "Duplicate the file ''{filename}''",
  }),
  renameButton: defineMessage({
    id: "project.file-action-modal.rename.button",
    defaultMessage: "Rename File",
  }),
  duplicateButton: defineMessage({
    id: "project.file-action-modal.duplicate.button",
    defaultMessage: "Duplicate File",
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

  const isOpen = !!file_action && (checked_files?.size ?? 0) > 0;
  if (!isOpen || !actions) return null;

  const actionInfo = FILE_ACTIONS[file_action];
  if (!actionInfo) return null;

  const file_map = displayed_listing?.file_map;
  const renameFormId = "file-action-rename-form";
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

  const isCopyModal = file_action === "copy";
  const isMoveModal = file_action === "move";
  const modalWidth = isCopyModal
    ? "90vw"
    : isMoveModal
      ? "min(95vw, max(75vw, 900px))"
      : undefined;
  const modalStyle = isCopyModal ? { maxWidth: "1400px" } : undefined;

  return (
    <Modal
      open
      title={title}
      onCancel={() => actions.set_file_action()}
      footer={
        file_action === "rename" || file_action === "duplicate"
          ? [
              <Button key="cancel" onClick={() => actions.set_file_action()}>
                {intl.formatMessage(labels.cancel)}
              </Button>,
              <Button
                key="submit"
                type="primary"
                htmlType="submit"
                form={renameFormId}
              >
                {intl.formatMessage(
                  file_action === "duplicate"
                    ? MODAL_LABELS.duplicateButton
                    : MODAL_LABELS.renameButton,
                )}
              </Button>,
            ]
          : null
      }
      destroyOnHidden
      width={modalWidth}
      style={modalStyle}
      styles={{
        body: {
          maxHeight: "72vh",
          overflowY: "auto",
          padding: "8px 16px 20px 16px",
        },
      }}
    >
      <ActionBox
        modal
        file_action={file_action}
        checked_files={checked_files}
        current_path={current_path}
        project_id={project_id}
        file_map={file_map}
        actions={actions}
        name={project_redux_name(project_id)}
        renameFormId={renameFormId}
      />
    </Modal>
  );
}
