import { Button, InputNumber, Modal, Spin } from "antd";
import { useState } from "react";

import ShowError from "@cocalc/frontend/components/error";
import { Icon } from "@cocalc/frontend/components/icon";
import { CancelText } from "@cocalc/frontend/i18n/components";
import type { CloudFilesystem } from "@cocalc/util/db-schema/cloud-filesystems";
import { MAX_PORT, MIN_PORT } from "@cocalc/util/db-schema/cloud-filesystems";
import { editCloudFilesystem } from "./api";
import { MountAndKeyDBOptions } from "./create";
import { editModalStyle } from "./util";

interface Props {
  cloudFilesystem: CloudFilesystem;
  open?: boolean;
  setOpen;
  refresh;
}

export default function EditMountOptions({
  cloudFilesystem,
  open,
  setOpen,
  refresh,
}: Props) {
  const [changing, setChanging] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [configuration, setConfiguration] = useState<{
    keydb_options: string;
    mount_options: string;
    port: number | null;
  }>({
    keydb_options: cloudFilesystem.keydb_options ?? "",
    mount_options: cloudFilesystem.mount_options ?? "",
    port: cloudFilesystem.port,
  });

  const changed = !(
    cloudFilesystem.keydb_options == configuration.keydb_options &&
    cloudFilesystem.mount_options == configuration.mount_options &&
    cloudFilesystem.port == configuration.port
  );

  const doEdit = async () => {
    if (!changed) {
      // no op
      setOpen(false);
      return;
    }
    try {
      setChanging(true);
      await editCloudFilesystem({
        id: cloudFilesystem.id,
        ...configuration,
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
      style={{ maxWidth: "100%" }}
      styles={{ body: editModalStyle(cloudFilesystem) }}
      width={750}
      centered
      title={
        <>
          <Icon name={"disk-snapshot"} /> Edit the Mount and KeyDB Options for
          the cloud file system "{cloudFilesystem.title?.trim()}"
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
          disabled={changing || !changed}
          onClick={doEdit}
        >
          Change{" "}
          {changing ? <Spin style={{ marginLeft: "15px" }} /> : undefined}
        </Button>,
      ]}
    >
      <MountAndKeyDBOptions
        showHeader={false}
        configuration={configuration}
        setConfiguration={setConfiguration}
        disabled={cloudFilesystem.mount}
      />
      <h6>KeyDB Port</h6>
      <p>
        The KeyDB server will listen on port {configuration.port}. You can
        change this to a different port between {MIN_PORT} and {MAX_PORT}, in
        case it conflicts with some other software you are using.
      </p>
      <div style={{ textAlign: "center" }}>
        <InputNumber
          disabled={cloudFilesystem.mount}
          size="large"
          style={{ width: "200px" }}
          min={MIN_PORT}
          max={MAX_PORT}
          value={configuration.port}
          onChange={(port) => setConfiguration({ ...configuration, port })}
        />
      </div>

      <ShowError
        style={{ marginTop: "15px" }}
        error={error}
        setError={setError}
      />
      <h6>Advanced</h6>
      <pre style={{ overflowY: "scroll", maxHeight: "100px" }}>
        {JSON.stringify(cloudFilesystem, undefined, 2)}
      </pre>
    </Modal>
  );
}
