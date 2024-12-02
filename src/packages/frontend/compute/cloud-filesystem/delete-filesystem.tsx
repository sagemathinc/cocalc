import { Alert, Button, Input, Modal, Popconfirm, Spin } from "antd";
import { useState } from "react";

import ShowError from "@cocalc/frontend/components/error";
import { Icon } from "@cocalc/frontend/components/icon";
import { CancelText } from "@cocalc/frontend/i18n/components";
import type { CloudFilesystem } from "@cocalc/util/db-schema/cloud-filesystems";
import { deleteCloudFilesystem } from "./api";
import { editModalStyle } from "./util";

interface Props {
  cloudFilesystem: CloudFilesystem;
  open?: boolean;
  setOpen;
  refresh;
}

export default function DeleteCloudFilesystem({
  cloudFilesystem,
  open,
  setOpen,
  refresh,
}: Props) {
  const lock = cloudFilesystem.lock ?? "DELETE";
  const [unlock, setUnlock] = useState<string>("");
  const [deleting, setDeleting] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const doDelete = async () => {
    try {
      setDeleting(true);
      await deleteCloudFilesystem({ id: cloudFilesystem.id, lock: unlock });
      refresh();
      setOpen(false);
    } catch (err) {
      setError(`${err}`);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal
      styles={{ body: editModalStyle(cloudFilesystem) }}
      centered
      title={
        <>
          <Icon name="trash" /> Delete "{cloudFilesystem.title}"{" "}
        </>
      }
      open={open}
      onCancel={() => setOpen(false)}
      footer={[
        <Button key="cancel" onClick={() => setOpen(false)}>
          <CancelText />
        </Button>,
        <Popconfirm
          key="ok"
          title={
            <>
              <b>Permanently delete</b> '{cloudFilesystem.title}' (Id:{" "}
              {cloudFilesystem.project_specific_id})?
            </>
          }
          onConfirm={doDelete}
          okText="Delete"
          cancelText="No"
        >
          <Button type="primary" danger disabled={unlock != lock || deleting}>
            <Icon name="trash" /> Delete...{" "}
            {deleting ? <Spin style={{ marginLeft: "15px" }} /> : undefined}
          </Button>
        </Popconfirm>,
      ]}
    >
      <Alert
        type="warning"
        showIcon
        message={
          <>
            <p>
              Are you sure you want to delete '{cloudFilesystem.title}' (Id:{" "}
              {cloudFilesystem.project_specific_id}) with mountpoint{" "}
              <code>~/{cloudFilesystem.mountpoint}</code>? This action will
              permanently delete all data. <b>Data will not be recoverable.</b>
            </p>
            <p>Confirm deletion by typing "{lock}" below:</p>
            <Input
              status={unlock != lock ? "error" : "warning"}
              value={unlock}
              onChange={(e) => setUnlock(e.target.value)}
            />
          </>
        }
      />
      <ShowError error={error} setError={setError} />
    </Modal>
  );
}
