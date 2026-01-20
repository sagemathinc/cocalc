import { useEffect, useState } from "react";
import { Button, Modal, Spin } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import ShowError from "@cocalc/frontend/components/error";
import { useProjectContext } from "@cocalc/frontend/project/context";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { useTypedRedux } from "@cocalc/frontend/app-framework";

export default function CreateBackup() {
  const { actions, project_id } = useProjectContext();
  const [open, setOpen] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const openCreate = useTypedRedux({ project_id }, "open_create_backup");

  useEffect(() => {
    if (!open) return;
    actions?.setState({ disableExplorerKeyhandler: true });
    return () => actions?.setState({ disableExplorerKeyhandler: false });
  }, [open]);

  if (!project_id) return null;

  useEffect(() => {
    if (!openCreate) return;
    setOpen(true);
    actions?.setState({ open_create_backup: false });
  }, [actions, openCreate]);

  async function createBackup() {
    try {
      setLoading(true);
      setError("");
      const op = await webapp_client.conat_client.hub.projects.createBackup({
        project_id,
      });
      actions?.trackBackupOp(op);
      setOpen(false);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button disabled={open} onClick={() => setOpen(true)}>
        <Icon name="cloud-upload" /> Create Backup
      </Button>
      {open && (
        <Modal
          title={
            <>
              <Icon name="cloud-upload" /> Create Backup{" "}
              {loading && (
                <Spin style={{ float: "right", marginRight: "15px" }} />
              )}
            </>
          }
          open={open}
          onCancel={() => setOpen(false)}
          footer={[
            <Button key="cancel" onClick={() => setOpen(false)}>
              Cancel
            </Button>,
            <Button
              key="create"
              type="primary"
              onClick={createBackup}
              loading={loading}
            >
              Create Backup
            </Button>,
          ]}
        >
          <p>
            Backups are archives that include your workspace files, any
            software you have installed, and TimeTravel edit history, but not
            the contents of /tmp or /scratch. Backups
            are state stored separately from workspace hosts.
            Creating a backup runs in the background and does
            not interrupt your work.
          </p>
          <ShowError style={{ marginTop: "10px" }} error={error} setError={setError} />
        </Modal>
      )}
    </>
  );
}
