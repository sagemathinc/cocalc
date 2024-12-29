import { Button, Divider, Flex, Modal, Space } from "antd";
import { useEffect, useState } from "react";
import SelectServer from "@cocalc/frontend/compute/select-server";
import type { ComputeServerConfig } from "../types";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import type { CourseActions } from "../actions";
import { useRedux } from "@cocalc/frontend/app-framework";
import ComputeServerTerminalCommand from "./terminal-command";
import { Icon } from "@cocalc/frontend/components/icon";
import { capitalize } from "@cocalc/util/misc";
import ShowError from "@cocalc/frontend/components/error";

import { getUnitId } from "./util";

interface Props {
  onClose: () => void;
  actions: CourseActions;
  config: ComputeServerConfig;
  setConfig: (config: ComputeServerConfig) => void;
  unit;
}

export default function ComputeServerModal({
  onClose,
  actions,
  config,
  setConfig,
  unit,
}: Props) {
  const { project_id } = useFrameContext();
  const [terminalCommand, setTerminalCommand] = useState<boolean>(false);
  const [server_id, setServerId] = useState<number | undefined>(
    config.server_id,
  );
  useEffect(() => {
    setServerId(config.server_id);
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
              setConfig({ ...config, server_id });
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
            <Students actions={actions} config={config} unit={unit} />
          </>
        )}
      </Space>
    </Modal>
  );
}

function Students({ actions, config, unit }) {
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
        unit={unit}
      />,
    );
  }
  return <Space direction="vertical">{v}</Space>;
}

const ACTIONS = [
  "create",
  "start",
  "stop",
  "delete",
  "deprovision",
  "transfer",
];

function StudentControl({ student, actions, config, unit }) {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  console.log({ config });
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
  for (const action of ACTIONS) {
    v.push(
      <Button
        disabled={loading}
        onClick={() => {
          try {
            setLoading(true);
            const unit_id = getUnitId(unit);
            actions.compute.createComputeServer({ student_id, unit_id });
          } catch (err) {
            setError(`${err}`);
          } finally {
            setLoading(false);
          }
        }}
        key={action}
      >
        {capitalize(action)}
      </Button>,
    );
  }
  return (
    <>
      <Space>{v}</Space>{" "}
      <ShowError style={{ margin: "15px" }} error={error} setError={setError} />
    </>
  );
}
