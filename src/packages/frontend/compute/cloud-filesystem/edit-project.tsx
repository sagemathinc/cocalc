import { Button, Modal, Spin } from "antd";
import { useState } from "react";

import ShowError from "@cocalc/frontend/components/error";
import { Icon } from "@cocalc/frontend/components/icon";
import { CancelText } from "@cocalc/frontend/i18n/components";
import { SelectProject } from "@cocalc/frontend/projects/select-project";
import type { CloudFilesystem } from "@cocalc/util/db-schema/cloud-filesystems";
import { editCloudFilesystem } from "./api";
import { editModalStyle } from "./util";

interface Props {
  cloudFilesystem: CloudFilesystem;
  open?: boolean;
  setOpen;
  refresh;
}

// Edit the project_id of a cloud file system
export default function EditProjectId({
  cloudFilesystem,
  open,
  setOpen,
  refresh,
}: Props) {
  const [changing, setChanging] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [project_id, setProjectId] = useState<string>(
    cloudFilesystem.project_id,
  );

  const doEdit = async () => {
    if (cloudFilesystem.project_id == project_id) {
      // no op
      setOpen(false);
      return;
    }
    try {
      setChanging(true);
      await editCloudFilesystem({
        id: cloudFilesystem.id,
        project_id,
      });
      refresh();
      setOpen(false);
    } catch (err) {
      setError(`${err}`);
    } finally {
      setChanging(false);
    }
  };

  return (
    <Modal
      styles={{ body: editModalStyle(cloudFilesystem) }}
      centered
      title={
        <>
          <Icon name={"folder-open"} /> Move "{cloudFilesystem.title}" to
          Another Project
        </>
      }
      open={open}
      onCancel={() => setOpen(false)}
      footer={[
        <Button key="cancel" onClick={() => setOpen(false)}>
          <CancelText />
        </Button>,
        <Button
          key="ok"
          type="primary"
          disabled={changing || cloudFilesystem.project_id == project_id}
          onClick={doEdit}
        >
          Move Filesystem{" "}
          {changing ? <Spin style={{ marginLeft: "15px" }} /> : undefined}
        </Button>,
      ]}
    >
      <p>
        You can instantly move this cloud file system to any other project that
        you are a collaborator on.
      </p>
      <SelectProject
        at_top={[cloudFilesystem.project_id]}
        value={project_id}
        onChange={setProjectId}
      />
      <ShowError error={error} setError={setError} />
    </Modal>
  );
}
