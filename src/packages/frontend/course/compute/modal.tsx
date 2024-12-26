import { Button, Divider, Flex, Modal, Space } from "antd";
import { useEffect, useState } from "react";
import SelectServer from "@cocalc/frontend/compute/select-server";
import type { ComputeServerConfig } from "../types";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import type { CourseActions } from "../actions";
import { useRedux } from "@cocalc/frontend/app-framework";
import ComputeServerTerminalCommand from "./terminal-command";
import { Icon } from "@cocalc/frontend/components/icon";

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
  const [terminalCommand, setTerminalCommand] = useState<boolean>(false);
  const [id, setId] = useState<number | undefined>(config.id);
  useEffect(() => {
    setId(config.id);
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
            value={id}
            setValue={(id) => {
              setId(id);
              setConfig({ ...config, id });
            }}
          />
          <div style={{ flex: 1 }} />
          <Button
            disabled={!id}
            onClick={() => setTerminalCommand(!terminalCommand)}
          >
            <Icon name="terminal" /> Terminal Command
          </Button>
        </Flex>

        {terminalCommand && !!id && <ComputeServerTerminalCommand />}
        {!!id && (
          <>
            <Divider orientation="left">Students</Divider>
            <Students actions={actions} config={config} setConfig={setConfig} />
          </>
        )}
      </Space>
    </Modal>
  );
}

function Students({ actions, config, setConfig }) {
  const students = useRedux(actions.name, "students");
  const v: JSX.Element[] = [];
  for (const [_, student] of students) {
    if (student.get("deleted")) {
      continue;
    }
    v.push(
      <StudentControl
        key={student.get("student_id")}
        student={student}
        actions={actions}
        config={config}
        setConfig={setConfig}
      />,
    );
  }
  return <Space direction="vertical">{v}</Space>;
}

function StudentControl({ student, actions, config, setConfig }) {
  const student_id = student.get("student_id");
  const name = actions.get_store().get_student_name(student.get("student_id"));
  const v = [
    <div
      key="name"
      style={{
        width: "150px",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {name}
    </div>,
  ];
  const status = config.status?.[student_id] ?? {};
  () => console.log(setConfig, status);
  v.push(<Button key="create">Create</Button>);
  v.push(
    <Button key="start" disabled>
      Start
    </Button>,
  );
  v.push(
    <Button key="stop" disabled>
      Stop
    </Button>,
  );
  v.push(
    <Button key="delete" disabled>
      Delete
    </Button>,
  );
  v.push(
    <Button key="deprovision" disabled>
      Deprovision
    </Button>,
  );
  v.push(
    <Button key="transfer" disabled>
      Transfer
    </Button>,
  );
  return <Space>{v}</Space>;
}
