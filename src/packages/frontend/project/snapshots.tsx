/*
The Snapshots button pops up a model that:

 - lets you create a new snapshot
 - 

*/

import { useEffect, useRef, useState } from "react";
import type { InputRef } from "antd";
//import { SNAPSHOTS } from "@cocalc/util/consts/snapshots";
import { Button, Flex, Input, Modal, Space, Spin } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import ShowError from "@cocalc/frontend/components/error";
import { useProjectContext } from "@cocalc/frontend/project/context";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { delay } from "awaiting";

export default function Snapshots() {
  return (
    <Space.Compact>
      <CreateSnapshot />
      <EditSchedule />
    </Space.Compact>
  );
}

function CreateSnapshot() {
  const { actions, project_id } = useProjectContext();
  const [loading, setLoading] = useState<boolean>(false);
  const [open, setOpen] = useState<boolean>(false);
  const [name, setName] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [showHelp, setShowHelp] = useState<boolean>(false);
  const inputRef = useRef<InputRef>(null);

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

  async function createSnapshot() {
    try {
      setLoading(true);
      setError("");
      if (!name.trim()) {
        throw Error("name must be nonempty");
      }
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
      <Button disabled={open} onClick={() => setOpen(!open)}>
        <Icon name="disk-snapshot" /> New Snapshot
      </Button>
      <Modal
        afterOpenChange={async (open) => {
          if (!open) return;
          setName(new Date().toISOString());
          await delay(1);
          inputRef.current?.focus({
            cursor: "all",
          });
        }}
        title={
          <>
            <Icon name="disk-snapshot" /> Create Snapshot{" "}
            <Button
              size="small"
              type="text"
              style={{ float: "right", marginRight: "15px" }}
              onClick={() => setShowHelp(!showHelp)}
            >
              Help
            </Button>
            {loading && <Spin style={{ float: "right" }} />}
          </>
        }
        open={open}
        onOk={() => {
          setOpen(false);
        }}
        onCancel={() => {
          setOpen(false);
        }}
        footer={[
          <Button
            onClick={() => {
              setOpen(false);
              setName("");
            }}
          >
            Cancel
          </Button>,
          <Button
            type="primary"
            onClick={createSnapshot}
            disabled={!name.trim()}
          >
            Create Snapshot
          </Button>,
        ]}
      >
        {showHelp && (
          <p>
            Create instant lightwight snapshots of the exact state of all files
            in your project. Named snapshots remain until you delete them,
            whereas the default timestamp snapshots are created and deleted
            automatically according to a schedule. Only unique data in snapshots
            count against your quota.
          </p>
        )}
        <Flex style={{ width: "100%", marginTop: "5px" }}>
          <Input
            allowClear
            ref={inputRef}
            style={{ flex: 1 }}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name of snapshot to create..."
            onPressEnter={() => {
              if (name.trim()) {
                createSnapshot();
              }
            }}
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

function EditSchedule() {
  const { actions, project_id } = useProjectContext();
  const [loading, setLoading] = useState<boolean>(false);
  const [open, setOpen] = useState<boolean>(false);
  const [name, setName] = useState<string>("");
  const [error, setError] = useState<string>("");
  const inputRef = useRef<InputRef>(null);

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

  async function createSnapshot() {
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
            onClick={() => {
              setOpen(false);
              setName("");
            }}
          >
            Cancel
          </Button>,
          <Button
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
