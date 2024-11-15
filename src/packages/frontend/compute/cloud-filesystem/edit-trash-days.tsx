import { Button, InputNumber, Modal, Spin } from "antd";
import { useState } from "react";

import { A } from "@cocalc/frontend/components/A";
import ShowError from "@cocalc/frontend/components/error";
import { Icon } from "@cocalc/frontend/components/icon";
import { checkInAll } from "@cocalc/frontend/compute/check-in";
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

// Edit the title and color of a cloud file system
export default function EditTrashDays({
  cloudFilesystem,
  open,
  setOpen,
  refresh,
}: Props) {
  const [changing, setChanging] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [trashDays, setTrashDays] = useState<number>(
    cloudFilesystem.trash_days ?? 0,
  );

  const doEdit = async () => {
    if (cloudFilesystem.trash_days == trashDays) {
      // no op
      setOpen(false);
      return;
    }
    try {
      setChanging(true);
      await editCloudFilesystem({
        id: cloudFilesystem.id,
        trash_days: trashDays,
      });
      refresh();
      setOpen(false);
      if (cloudFilesystem.mount) {
        // cause quicker update
        checkInAll(cloudFilesystem.project_id);
      }
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
          <Icon name={"trash"} /> Edit Trash Configuration for "
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
          disabled={changing || cloudFilesystem.trash_days == trashDays}
          onClick={doEdit}
        >
          Change{" "}
          {changing ? <Spin style={{ marginLeft: "15px" }} /> : undefined}
        </Button>,
      ]}
    >
      <p style={{ textAlign: "center", fontSize: "12pt" }}>
        <b>
          <A href="https://juicefs.com/docs/community/security/trash/">
            JuiceFS Trash
          </A>{" "}
          is {cloudFilesystem.trash_days == 0 ? "disabled" : "enabled"}.
        </b>
      </p>
      Optionally store deleted files in{" "}
      <code>~/{cloudFilesystem.mountpoint}/.trash</code> for the number of days
      shown below. Set to 0 to disable. You can change this at any time, even
      when the file system is mounted, and it will be updated quickly.
      <div style={{ textAlign: "center" }}>
        <InputNumber
          addonAfter={"days"}
          min={0}
          onPressEnter={doEdit}
          style={{ width: "200px", margin: "10px 0", color: "red" }}
          value={trashDays}
          onChange={(d) => setTrashDays(Math.round(d ?? 0))}
        />
      </div>
      <p>
        To quickly empty the trash type{" "}
        <pre>sudo rm -rf ~/"{cloudFilesystem.mountpoint}"/.trash/*/*</pre> in a
        terminal.
      </p>
      <ShowError error={error} setError={setError} />
    </Modal>
  );
}
