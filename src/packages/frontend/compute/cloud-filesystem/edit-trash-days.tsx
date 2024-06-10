import { Button, InputNumber, Modal, Spin } from "antd";
import { useState } from "react";
import type { CloudFilesystem } from "@cocalc/util/db-schema/cloud-filesystems";
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

// Edit the title and color of a cloud filesystem
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
    } catch (err) {
      setError(`${err}`);
    } finally {
      setChanging(false);
    }
  };

  return (
    <Modal
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
          Cancel
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
          is {trashDays == 0 ? "disabled" : "enabled"}.
        </b>
      </p>
      Optionally store deleted files in{" "}
      <code>~/{cloudFilesystem.mountpoint}/.trash</code> for the number of days
      shown below. Set to 0 to disable.
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
      <ShowError error={error} setError={setError} />
    </Modal>
  );
}
