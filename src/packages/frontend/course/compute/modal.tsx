import { Button, Divider, Flex, Modal, Space } from "antd";
import { useEffect, useState } from "react";
import SelectServer from "@cocalc/frontend/compute/select-server";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import type { CourseActions } from "../actions";
import { Icon } from "@cocalc/frontend/components/icon";
import Students from "./students";
import type { Unit } from "../store";
import { getUnitId } from "./util";
import ComputeServerTerminalCommand from "./terminal-command";

interface Props {
  onClose: () => void;
  actions: CourseActions;
  unit: Unit;
}

export default function ComputeServerModal({ onClose, actions, unit }: Props) {
  const { project_id } = useFrameContext();
  const [terminalCommand, setTerminalCommand] = useState<boolean>(false);
  const config = unit?.get("compute_server");
  const [server_id, setServerId] = useState<number | undefined>(
    config?.get("server_id"),
  );
  useEffect(() => {
    setServerId(config?.get("server_id"));
  }, [config]);

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
        project. The compute server in the student project does not have a copy
        of the underlying data and installed files of your compute server; it
        just has the same configuration (e.g., cpu, RAM, disk size).
      </p>
      <Space direction="vertical" style={{ width: "100%" }}>
        <Flex style={{ width: "100%", alignItems: "center" }}>
          <div style={{ marginRight: "30px" }}>Compute Server:</div>
          <SelectServer
            title="A compute server with identical configuration to the selected one will be created in each student project."
            fullLabel
            style={{ borderRadius: "5px" }}
            project_id={project_id}
            value={server_id}
            setValue={(server_id) => {
              setServerId(server_id);
              actions.compute.setComputeServerConfig({
                unit_id: getUnitId(unit),
                compute_server: {
                  server_id,
                },
              });
            }}
          />
          <div style={{ flex: 1 }} />
          <Button
            disabled={!server_id}
            onClick={() => setTerminalCommand(!terminalCommand)}
          >
            <Icon name="terminal" /> Terminal Command
          </Button>
        </Flex>

        {terminalCommand && !!server_id && <ComputeServerTerminalCommand />}
        {!!server_id && (
          <>
            <Divider orientation="left">Students</Divider>
            <Students actions={actions} unit={unit} />
          </>
        )}
      </Space>
    </Modal>
  );
}
