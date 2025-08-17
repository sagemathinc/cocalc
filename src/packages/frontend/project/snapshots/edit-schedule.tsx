import { useEffect, useRef, useState } from "react";
import { Button, Flex, Input, Modal, Space, Spin } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import ShowError from "@cocalc/frontend/components/error";
import { useProjectContext } from "@cocalc/frontend/project/context";
import { webapp_client } from "@cocalc/frontend/webapp-client";

export default  function EditSchedule() {
  const { actions, project_id } = useProjectContext();
  const [loading, setLoading] = useState<boolean>(false);
  const [open, setOpen] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (!open) {
      return;
    }
    actions?.setState({ disableExplorerKeyhandler: true });
    return () => {
      actions?.setState({ disableExplorerKeyhandler: false });
    };
  }, [open]);

  if (!project_id) {
    return null;
  }

  async function setSchedule() {
    try {
      setLoading(true);
      setError("");
      await webapp_client.conat_client.hub.projects.createSnapshot({
        project_id,
        name,
      });
      setName("");
      setOpen(false);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        disabled={open}
        onClick={() => {
          setOpen(!open);
        }}
      >
        <Icon name="clock" /> Schedule
      </Button>
      <Modal
        afterOpenChange={(open) => {
          if (!open) return;
          setName(new Date().toISOString());
          inputRef.current?.focus({
            cursor: "all",
          });
        }}
        title={
          <>
            <Icon name="clock" /> Edit Schedule{" "}
            {loading && <Spin style={{ float: "right" }} />}
          </>
        }
        open={open}
        onOk={() => {
          setName("");
          setOpen(false);
        }}
        onCancel={() => {
          setName("");
          setOpen(false);
        }}
        footer={[
          <Button
            key="cancel"
            onClick={() => {
              setOpen(false);
              setName("");
            }}
          >
            Cancel
          </Button>,
          <Button
            key="create"
            type="primary"
            onClick={createSnapshot}
            disabled={!name.trim()}
          >
            Create Snapshot
          </Button>,
        ]}
      >
        <Flex style={{ width: "100%" }}>
          <Input
            ref={inputRef}
            style={{ flex: 1 }}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name of snapshot..."
            onPressEnter={createSnapshot}
          />
        </Flex>
        <ShowError
          style={{ marginTop: "10px" }}
          error={error}
          setError={setError}
        />
      </Modal>
    </>
  );
}
