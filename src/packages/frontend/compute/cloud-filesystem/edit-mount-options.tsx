import { Button, Modal, Spin } from "antd";
import { useState } from "react";
import type { CloudFilesystem } from "@cocalc/util/db-schema/cloud-filesystems";
import { Icon } from "@cocalc/frontend/components/icon";
import ShowError from "@cocalc/frontend/components/error";
import { editCloudFilesystem } from "./api";
import { MountAndKeyDBOptions } from "./create";

interface Props {
  cloudFilesystem: CloudFilesystem;
  open?: boolean;
  setOpen;
  refresh;
}

export default function EditBucketStorageClass({
  cloudFilesystem,
  open,
  setOpen,
  refresh,
}: Props) {
  const [changing, setChanging] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [configuration, setConfiguration] = useState<{
    keydb_options: string;
    mount_options: string;
  }>({
    keydb_options: cloudFilesystem.keydb_options ?? "",
    mount_options: cloudFilesystem.mount_options ?? "",
  });

  const doEdit = async () => {
    const { keydb_options, mount_options } = configuration;
    if (
      cloudFilesystem.keydb_options == keydb_options &&
      cloudFilesystem.mount_options == mount_options
    ) {
      // no op
      setOpen(false);
      return;
    }
    try {
      setChanging(true);
      await editCloudFilesystem({
        id: cloudFilesystem.id,
        keydb_options,
        mount_options,
      });
      refresh();
      setOpen(false);
    } catch (err) {
      setError(`${err}`);
    } finally {
      setChanging(false);
    }
  };

  return (
    <Modal
      style={{ maxWidth: "100%" }}
      width={750}
      centered
      title={
        <>
          <Icon name={"disk-snapshot"} /> Edit the Mount and KeyDB Options for
          the cloud filesystem "{cloudFilesystem.title?.trim()}"
        </>
      }
      open={open}
      onCancel={() => setOpen(false)}
      footer={[
        <Button key="cancel" onClick={() => setOpen(false)}>
          Cancel
        </Button>,
        <Button
          key="ok"
          type="primary"
          disabled={
            changing ||
            (cloudFilesystem.keydb_options == configuration.keydb_options &&
              cloudFilesystem.mount_options == configuration.mount_options)
          }
          onClick={doEdit}
        >
          Change{" "}
          {changing ? <Spin style={{ marginLeft: "15px" }} /> : undefined}
        </Button>,
      ]}
    >
      <MountAndKeyDBOptions
        showHeader={false}
        configuration={configuration}
        setConfiguration={setConfiguration}
      />
      <ShowError error={error} setError={setError} />
    </Modal>
  );
}
