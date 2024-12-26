import { Button, Modal } from "antd";
import { useState } from "react";
import { Icon } from "@cocalc/frontend/components/icon";
import SelectServer from "@cocalc/frontend/compute/select-server";
//import type { ComputeServerAction } from "../types";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";

export function ComputeServerButton({ style }: { style? }) {
  const [open, setOpen] = useState<boolean>(false);
  return (
    <>
      <Button
        style={style}
        onClick={() => {
          setOpen(!open);
        }}
      >
        <Icon name="server" /> Compute Server
      </Button>
      {open && <ComputeServerModal onClose={() => setOpen(false)} />}
    </>
  );
}

function ComputeServerModal({ onClose }) {
  const { project_id } = useFrameContext();
  const [id, setId] = useState<number | undefined>(undefined);
  return (
    <Modal
      width={800}
      open
      title="Compute Server"
      onOk={onClose}
      onCancel={onClose}
    >
      <SelectServer
        title="A compute server with identical configuration to the selected one will be created in each student project."
        fullLabel
        style={{ borderRadius: "5px" }}
        project_id={project_id}
        value={id}
        setValue={setId}
      />
    </Modal>
  );
}
