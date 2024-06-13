import { Alert, Button, Modal, Spin } from "antd";
import { useState } from "react";
import type { CloudFilesystem } from "@cocalc/util/db-schema/cloud-filesystems";
import { Icon } from "@cocalc/frontend/components/icon";
import { A } from "@cocalc/frontend/components/A";
import ShowError from "@cocalc/frontend/components/error";
import { editCloudFilesystem } from "./api";
import { Mountpoint } from "./cloud-filesystem";
import { checkInAll } from "@cocalc/frontend/compute/check-in";
import { editModalStyle } from "./util";

interface Props {
  cloudFilesystem: CloudFilesystem;
  open?: boolean;
  setOpen;
  refresh;
}

// Actually toggles Mount status
export default function MountCloudFilesystem({
  cloudFilesystem,
  open,
  setOpen,
  refresh,
}: Props) {
  const [mounting, setMounting] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const doToggleMount = async () => {
    try {
      setMounting(true);
      await editCloudFilesystem({
        id: cloudFilesystem.id,
        mount: !cloudFilesystem.mount,
      });
      checkInAll(cloudFilesystem.project_id);
      refresh();
      setOpen(false);
    } catch (err) {
      setError(`${err}`);
    } finally {
      setMounting(false);
    }
  };
  const icon = cloudFilesystem.mount ? "stop" : "run";
  const verb = cloudFilesystem.mount ? "Disable Automount" : "Automount";

  return (
    <Modal
      styles={{ body: editModalStyle(cloudFilesystem) }}
      centered
      title={
        <>
          <Icon name={icon} /> {verb} "{cloudFilesystem.title}"{" "}
          {cloudFilesystem.mount ? "from" : "at"}{" "}
          <Mountpoint {...cloudFilesystem} />?
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
          danger={cloudFilesystem.mount}
          disabled={mounting}
          onClick={doToggleMount}
        >
          <Icon name={icon} /> {verb}{" "}
          {mounting ? <Spin style={{ marginLeft: "15px" }} /> : undefined}
        </Button>,
      ]}
    >
      <p>
        <p>
          Are you sure you want to{" "}
          {cloudFilesystem.mount ? "unmount" : "automount"} this cloud
          filesystem?
          {cloudFilesystem.mount
            ? " The filesystem is currently mounted so make sure no applications have anything in this filesystem open to avoid data loss. "
            : " "}
          {cloudFilesystem.mount ? "Unmounting" : "Automatic mounting"}{" "}
          typically takes about <b>15 seconds</b>.
        </p>
        <Alert
          showIcon
          style={{ margin: "10px 0" }}
          type="warning"
          message="Currently cloud filesystems are only visible from compute servers, e.g., from a Jupyter notebook or terminal that is set to use a compute server."
        />
        <p style={{ color: "#666" }}>
          <b>WARNING:</b> When a cloud filesystem is first created or has not
          been used for a while, it can take several minutes to automount in a
          running project while{" "}
          <A href="https://cloud.google.com/iam/docs/access-change-propagation">
            security policies
          </A>{" "}
          propagate.
        </p>
      </p>
      <ShowError error={error} setError={setError} />
    </Modal>
  );
}
