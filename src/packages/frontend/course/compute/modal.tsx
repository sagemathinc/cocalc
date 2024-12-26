import { Modal } from "antd";
import { useEffect, useState } from "react";
import SelectServer from "@cocalc/frontend/compute/select-server";
import type { ComputeServerConfig } from "../types";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import type { CourseActions } from "../actions";

interface Props {
  onClose: () => void;
  actions: CourseActions;
  config: ComputeServerConfig;
  setConfig: (config: ComputeServerConfig) => void;
}

export default function ComputeServerModal({
  onClose,
  actions,
  config,
  setConfig,
}: Props) {
  const { project_id } = useFrameContext();
  const [id, setId] = useState<number | undefined>(config.id);
  useEffect(() => {
    setId(config.id);
  }, [config]);

  () => console.log(actions);

  return (
    <Modal
      width={800}
      open
      title={<>Compute Server Configuration</>}
      onOk={onClose}
      onCancel={onClose}
    >
      <p>
        Select a compute server from this instructor project. You can then
        easily create an identically configured compute server in each student
        project. Also, any notebooks (or other files) opened on this compute
        server will be configured for the student by default to open on their
        compute server. The compute server in the student project does not have
        a copy of the underlying data and installed files of your compute
        server; it just has the same configuration (e.g., cpu, RAM, disk size).
      </p>
      <SelectServer
        title="A compute server with identical configuration to the selected one will be created in each student project."
        fullLabel
        style={{ borderRadius: "5px" }}
        project_id={project_id}
        value={id}
        setValue={(id) => {
          setId(id);
          setConfig({ ...config, id });
        }}
      />
    </Modal>
  );
}
