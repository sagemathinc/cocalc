import { Button, Select, Modal, Spin } from "antd";
import { useState } from "react";
import type {
  CloudFilesystem,
  GoogleCloudBucketStorageClass,
} from "@cocalc/util/db-schema/cloud-filesystems";
import {
  GOOGLE_CLOUD_BUCKET_STORAGE_CLASSES,
  GOOGLE_CLOUD_BUCKET_STORAGE_CLASSES_DESC,
} from "@cocalc/util/db-schema/cloud-filesystems";
import { Icon } from "@cocalc/frontend/components/icon";
import { A } from "@cocalc/frontend/components/A";
import ShowError from "@cocalc/frontend/components/error";
import { editCloudFilesystem } from "./api";

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
  const [storageClass, setStorageClass] =
    useState<GoogleCloudBucketStorageClass>(
      cloudFilesystem.bucket_storage_class ?? "standard",
    );

  const doEdit = async () => {
    if (cloudFilesystem.bucket_storage_class == storageClass) {
      // no op
      setOpen(false);
      return;
    }
    try {
      setChanging(true);
      await editCloudFilesystem({
        id: cloudFilesystem.id,
        bucket_storage_class: storageClass,
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
          for the cloud filesystem "{cloudFilesystem.title?.trim()}"
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
            changing || cloudFilesystem.bucket_storage_class == storageClass
          }
          onClick={doEdit}
        >
          Change{" "}
          {changing ? <Spin style={{ marginLeft: "15px" }} /> : undefined}
        </Button>,
      ]}
    >
      The{" "}
      <A href="https://cloud.google.com/storage/docs/storage-classes">
        Google Cloud Bucket Storage Class
      </A>{" "}
      determines how much it costs to store and access your files, but has
      minimal impact on speed. You can change the storage class at any time, but
      the change only impacts <i>newly created data</i> going forward.
      <Select
        style={{ width: "100%", margin: "10px 0" }}
        options={GOOGLE_CLOUD_BUCKET_STORAGE_CLASSES.map(
          (bucket_storage_class) => {
            return {
              value: bucket_storage_class,
              key: bucket_storage_class,
              label:
                GOOGLE_CLOUD_BUCKET_STORAGE_CLASSES_DESC[
                  bucket_storage_class
                ] ?? bucket_storage_class,
            };
          },
        )}
        value={storageClass}
        onChange={setStorageClass}
      />
      <ShowError error={error} setError={setError} />
    </Modal>
  );
}
