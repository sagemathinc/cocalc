import { Button, Modal, Spin } from "antd";
import { useState } from "react";

import ShowError from "@cocalc/frontend/components/error";
import { Icon } from "@cocalc/frontend/components/icon";
import { CancelText } from "@cocalc/frontend/i18n/components";
import type { CloudFilesystem } from "@cocalc/util/db-schema/cloud-filesystems";
import { editCloudFilesystem } from "./api";
import { BucketStorageClass } from "./bucket";

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
  const [configuration, setConfiguration] =
    useState<CloudFilesystem>(cloudFilesystem);

  const doEdit = async () => {
    if (
      cloudFilesystem.bucket_storage_class == configuration.bucket_storage_class
    ) {
      // no op
      setOpen(false);
      return;
    }
    try {
      setChanging(true);
      await editCloudFilesystem({
        id: cloudFilesystem.id,
        bucket_storage_class: configuration.bucket_storage_class,
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
          <Icon name={"disk-snapshot"} /> Edit the Default Bucket Storage Class
          for the cloud file system "{cloudFilesystem.title?.trim()}"
        </>
      }
      open={open}
      onCancel={() => setOpen(false)}
      footer={[
        <Button key="cancel" onClick={() => setOpen(false)}>
          <CancelText />
        </Button>,
        <Button
          key="ok"
          type="primary"
          disabled={
            changing ||
            cloudFilesystem.bucket_storage_class ==
              configuration.bucket_storage_class
          }
          onClick={doEdit}
        >
          Change{" "}
          {changing ? <Spin style={{ marginLeft: "15px" }} /> : undefined}
        </Button>,
      ]}
    >
      <BucketStorageClass
        configuration={configuration}
        setConfiguration={setConfiguration}
      />

      <ShowError error={error} setError={setError} />
    </Modal>
  );
}
