import { Button, Input, Modal, Spin } from "antd";
import { useState } from "react";

import ShowError from "@cocalc/frontend/components/error";
import { Icon } from "@cocalc/frontend/components/icon";
import { CancelText } from "@cocalc/frontend/i18n/components";
import type { CloudFilesystem } from "@cocalc/util/db-schema/cloud-filesystems";
import { editCloudFilesystem } from "./api";
import { editModalStyle } from "./util";

interface Props {
  cloudFilesystem: CloudFilesystem;
  open?: boolean;
  setOpen;
  refresh;
}

// Edit the mountpoint of a cloud file system
export default function EditMountpoint({
  cloudFilesystem,
  open,
  setOpen,
  refresh,
}: Props) {
  const [changing, setChanging] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [mountpoint, setMountpoint] = useState<string>(
    cloudFilesystem.mountpoint,
  );

  const doEditMountpoint = async () => {
    if (cloudFilesystem.mountpoint == mountpoint) {
      // no op
      setOpen(false);
      return;
    }
    try {
      setChanging(true);
      await editCloudFilesystem({
        id: cloudFilesystem.id,
        mountpoint,
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
      styles={{ body: editModalStyle(cloudFilesystem) }}
      centered
      title={
        <>
          <Icon name={"folder-open"} /> Edit Mountpoint of "
          {cloudFilesystem.title}"
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
          disabled={changing || cloudFilesystem.mountpoint == mountpoint}
          onClick={doEditMountpoint}
        >
          Change Mountpoint{" "}
          {changing ? <Spin style={{ marginLeft: "15px" }} /> : undefined}
        </Button>,
      ]}
    >
      Mount at <code>~/{mountpoint}</code> on all compute servers.
      <Input
        onPressEnter={doEditMountpoint}
        style={{ width: "100%", marginTop: "10px" }}
        value={mountpoint}
        onChange={(e) => setMountpoint(e.target.value)}
      />
      <ShowError error={error} setError={setError} />
    </Modal>
  );
}
