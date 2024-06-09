import { Alert, Button, Modal, Spin } from "antd";
import { useState } from "react";
import type { CloudFilesystem } from "@cocalc/util/db-schema/cloud-filesystems";
import { Icon } from "@cocalc/frontend/components/icon";
import ShowError from "@cocalc/frontend/components/error";
import { editCloudFilesystem } from "./api";
import { Mountpoint } from "./cloud-filesystem";

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
      refresh();
      setOpen(false);
    } catch (err) {
      setError(`${err}`);
    } finally {
      setMounting(false);
    }
  };
  const icon = cloudFilesystem.mount ? "stop" : "run";
  const verb = cloudFilesystem.mount ? "Unmount" : "Mount";

  return (
    <Modal
      centered
      title={
        <>
          <Icon name={icon} /> {verb} "{cloudFilesystem.title}"{" "}
          {cloudFilesystem.mount ? "from" : "at"}{" "}
          <Mountpoint {...cloudFilesystem} />
        </>
      }
      open={open}
      onCancel={() => setOpen(false)}
      footer={[
        <Button onClick={() => setOpen(false)}>Cancel</Button>,
        <Button
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
      <Alert
        type={cloudFilesystem.mount ? "warning" : "info"}
        showIcon
        message={
          <>
            <p>
              Are you sure you want to{" "}
              {cloudFilesystem.mount ? "unmount" : "mount"} this filesystem?
              {cloudFilesystem.mount
                ? " The filesystem is currently mounted so make sure no applications have anything in this filesystem open to avoid data loss. "
                : " "}
              Expect {cloudFilesystem.mount ? "unmounting" : "mounting"} to take
              about <b>30 seconds</b> on any running compute server.
            </p>
          </>
        }
      />
      <ShowError error={error} setError={setError} />
    </Modal>
  );
}
