/*
The Snapshots button pops up a model that:

 - lets you create a new snapshot
 -

*/

import { useEffect, useRef, useState } from "react";
import type { InputRef } from "antd";
import { Button, Input, Modal, Spin } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import ShowError from "@cocalc/frontend/components/error";
import { useProjectContext } from "@cocalc/frontend/project/context";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { useTypedRedux } from "@cocalc/frontend/app-framework";

export default function CreateSnapshot() {
  const { actions, project_id } = useProjectContext();
  const [loading, setLoading] = useState<boolean>(false);
  const [open, setOpen] = useState<boolean>(false);
  const [name, setName] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [showHelp, setShowHelp] = useState<boolean>(false);
  const openCreate = useTypedRedux({ project_id }, "open_create_snapshot");
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

  useEffect(() => {
    if (!openCreate) return;
    setOpen(true);
    actions?.setState({ open_create_snapshot: false });
  }, [actions, openCreate]);

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
        <Icon name="disk-snapshot" /> Create Snapshot
      </Button>
      {open && (
        <Modal
          afterOpenChange={async (open) => {
            if (!open) return;
            setName(new Date().toISOString());
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
              {loading && (
                <Spin style={{ float: "right", marginRight: "15px" }} />
              )}
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
          {showHelp && (
            <p>
              Create instant lightwight snapshots of the exact state of all
              files in your project. Named snapshots remain until you delete
              them, whereas the default timestamp snapshots are created and
              deleted automatically according to a schedule. Only unique data in
              snapshots count against your quota.
            </p>
          )}
          <Input
            allowClear
            ref={inputRef}
            style={{ flex: 1, width: "100%", marginTop: "5px" }}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name of snapshot to create..."
            onPressEnter={() => {
              if (name.trim()) {
                createSnapshot();
              }
            }}
          />
          <ShowError
            style={{ marginTop: "10px" }}
            error={error}
            setError={setError}
          />
        </Modal>
      )}
    </>
  );
}
