import { Button, Input, Popconfirm } from "antd";
import { Icon } from "@cocalc/frontend/components";
import { useState } from "react";
import { computeServerAction } from "./api";
import ShowError from "@cocalc/frontend/components/error";

export default function DeleteVM({ id, state }) {
  const [error, setError] = useState<string>("");
  const [confirm, setConfirm] = useState<string>("");
  const [open, setOpen] = useState(false);
  return (
    <Popconfirm
      open={open}
      title="Are you sure you want to delete the virtual machine?"
      description={
        <div style={{ width: "400px" }}>
          This will completely delete the virtual machine, including the boot
          disk and any information on it. You can still start the VM again with
          the same amount of memory, etc., but you will have to reinstall any
          software.
          <Input
            style={{ marginTop: "5px" }}
            onChange={(e) => setConfirm(e.target.value)}
            value={confirm}
          />
        </div>
      }
      okButtonProps={{ disabled: confirm != `${id}` }}
      onConfirm={async () => {
        try {
          await computeServerAction({ id, action: "delete" });
        } catch (err) {
          setError(`${err}`);
        } finally {
          setOpen(false);
        }
      }}
      okText="Yes"
      cancelText="Cancel"
    >
      <Button
        disabled={state != "deleted" && state != "off"}
        danger
        onClick={() => setOpen(true)}
      >
        <Icon name="trash" /> Delete Virtual Machine...
      </Button>
      {state != "off" && (
        <span style={{ fontWeight: 250, marginLeft: "15px" }}>
          The VM must be off before you can delete it.
        </span>
      )}
      <ShowError error={error} setError={setError} />
    </Popconfirm>
  );
}
