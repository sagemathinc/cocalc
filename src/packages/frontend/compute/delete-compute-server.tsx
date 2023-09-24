import { Button, Input, Popconfirm } from "antd";
import { Icon } from "@cocalc/frontend/components";
import { useState } from "react";
import { deleteComputeServer } from "./api";
import ShowError from "@cocalc/frontend/components/error";

export default function DeleteComputeServer({ id, state }) {
  const [error, setError] = useState<string>("");
  const [confirm, setConfirm] = useState<string>("");
  const [open, setOpen] = useState(false);
  return (
    <Popconfirm
      open={open}
      title="Are you sure you want to delete this compute server?"
      description={
        <div style={{ width: "400px" }}>
          This will completely delete the corresponding VM and all information
          connecting this compute server with Jupyter notebooks or terminals. If
          so, type the id "{id}" of this compute server in the box below, then
          click Yes.
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
          await deleteComputeServer(id);
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
        disabled={state != "deleted"}
        danger
        onClick={() => setOpen(true)}
      >
        <Icon name="trash" /> Delete Compute Server
      </Button>
      {state != "deleted" && (
        <span style={{ fontWeight: 250, marginLeft: "15px" }}>
          The VM must be off before you can delete it.
        </span>
      )}
      <ShowError error={error} setError={setError} />
    </Popconfirm>
  );
}
