import { Alert, Button, Divider, Modal, Space } from "antd";
import { useEffect, useState } from "react";
import SelectServer from "@cocalc/frontend/compute/select-server";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import type { CourseActions } from "../actions";
import Students from "./students";
import type { Unit } from "../store";
import { getUnitId } from "./util";

interface Props {
  onClose: () => void;
  actions: CourseActions;
  unit: Unit;
}

export default function ComputeServerModal({ onClose, actions, unit }: Props) {
  const { project_id } = useFrameContext();
  const config = unit?.get("compute_server");
  const [server_id, setServerId] = useState<number | undefined>(
    config?.get("server_id"),
  );
  const [showHelp, setShowHelp] = useState<boolean>(false);
  useEffect(() => {
    setServerId(config?.get("server_id"));
  }, [config]);

  return (
    <Modal
      width={"90%"}
      open
      title={
        <>
          Compute Server Configuration{" "}
          <Button
            type="link"
            onClick={() => {
              setShowHelp(!showHelp);
            }}
          >
            {showHelp ? "Hide " : ""} Help
          </Button>
        </>
      }
      onOk={onClose}
      onCancel={onClose}
    >
      {showHelp && (
        <Alert
          style={{ margin: "15px 0 25px 0" }}
          type="info"
          message="Student Compute Servers"
          showIcon
          closable
          onClose={() => {
            setShowHelp(false);
          }}
          description={
            <>
              Select a compute server from this instructor project. You can then
              easily create and control identically configured compute servers
              in each student project.
              <ul>
                <li>
                  The compute server in the student project does not have a copy
                  of the underlying data and installed files of your compute
                  server; it just has the same configuration (e.g., cpu, RAM,
                  disk size).
                </li>
                <li>
                  If you select the same compute server for multiple
                  assignments, it is only created in the student's project once.
                </li>
                <li>
                  The person (probably you) who creates the compute server owns
                  it and pays all costs.
                </li>
              </ul>
            </>
          }
        />
      )}
      <Space direction="vertical" style={{ width: "100%" }}>
        <div style={{ textAlign: "center" }}>
          <Space style={{ alignItems: "center" }}>
            <div style={{ marginRight: "30px" }}>
              {server_id ? "" : "Select "}Compute Server
              {server_id ? "" : " (not Home Base)"}:
            </div>
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
          </Space>
        </div>
        {!!server_id && (
          <>
            <Divider titlePlacement="start">Student Compute Servers</Divider>
            <Students actions={actions} unit={unit} onClose={onClose} />
          </>
        )}
      </Space>
    </Modal>
  );
}
