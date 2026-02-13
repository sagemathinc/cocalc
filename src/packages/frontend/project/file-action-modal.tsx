/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Modal } from "antd";
import { useIntl } from "react-intl";

import {
  project_redux_name,
  useActions,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import ComputeServerTag from "@cocalc/frontend/compute/server-tag";
import { FILE_ACTIONS } from "@cocalc/frontend/project_actions";

import { useProjectContext } from "./context";
import { ActionBox } from "./explorer/action-box";

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

  const title = (
    <span>
      <Icon name={actionInfo.icon ?? "exclamation-circle"} />{" "}
      {intl.formatMessage(actionInfo.name)}
      {!!compute_server_id && (
        <ComputeServerTag
          id={compute_server_id}
          style={{ marginLeft: "10px" }}
        />
      )}
    </span>
  );

  return (
    <Modal
      open
      title={title}
      onCancel={() => actions.set_file_action()}
      footer={null}
      destroyOnClose
      width={700}
      styles={{ body: { maxHeight: "70vh", overflowY: "auto" } }}
    >
      <ActionBox
        modal
        file_action={file_action}
        checked_files={checked_files}
        current_path={current_path}
        project_id={project_id}
        file_map={file_map ?? {}}
        actions={actions as any}
        name={project_redux_name(project_id)}
      />
    </Modal>
  );
}
