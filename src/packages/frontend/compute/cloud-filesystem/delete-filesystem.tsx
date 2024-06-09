import { Alert, Button, Input, Modal, Popconfirm, Spin } from "antd";
import { useState } from "react";
import type { CloudFilesystem } from "@cocalc/util/db-schema/cloud-filesystems";
import { Icon } from "@cocalc/frontend/components/icon";
import ShowError from "@cocalc/frontend/components/error";
import { deleteCloudFilesystem } from "./api";

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
      title={
        <>
          <Icon name="trash" /> Delete Cloud Filesystem
        </>
      }
      open={open}
      onCancel={() => setOpen(false)}
      footer={[
        <Button onClick={() => setOpen(false)}>Cancel</Button>,
        <Popconfirm
          title={
            <>
              <b>Permanently delete</b> '{cloudFilesystem.title}' (Id:{" "}
              {cloudFilesystem.id})?
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
              {cloudFilesystem.id}) with mountpoint{" "}
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
