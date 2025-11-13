import { Alert, Button, Modal, Spin } from "antd";
import { useEffect, useRef, useState } from "react";

import { A } from "@cocalc/frontend/components/A";
import ShowError from "@cocalc/frontend/components/error";
import { Icon } from "@cocalc/frontend/components/icon";
import { checkInAll } from "@cocalc/frontend/compute/check-in";
import { CancelText } from "@cocalc/frontend/i18n/components";
import type { CloudFilesystem } from "@cocalc/util/db-schema/cloud-filesystems";
import { editCloudFilesystem } from "./api";
import { Mountpoint } from "./cloud-filesystem";
import { editModalStyle } from "./util";

interface Props {
  cloudFilesystem: CloudFilesystem;
  open?: boolean;
  setOpen;
  refresh;
}

// Actually toggles Mount status
export default function MountCloudFilesystem({
  cloudFilesystem,
  open,
  setOpen,
  refresh,
}: Props) {
  const [mounting, setMounting] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const buttonRef = useRef<any>(null);

  useEffect(() => {
    if (!cloudFilesystem.mount) {
      // only focus for mounting (the non-dangerous one)
      setTimeout(() => {
        buttonRef.current?.focus();
      }, 300);
    }
  }, []);

  const doToggleMount = async () => {
    try {
      setMounting(true);
      await editCloudFilesystem({
        id: cloudFilesystem.id,
        mount: !cloudFilesystem.mount,
      });
      checkInAll(cloudFilesystem.project_id);
      refresh();
      setOpen(false);
    } catch (err) {
      setError(`${err}`);
    } finally {
      setMounting(false);
    }
  };
  const icon = cloudFilesystem.mount ? "stop" : "run";
  const verb = cloudFilesystem.mount
    ? "Unmount and Disable Automount"
    : "Mount and Enable Automount";

  return (
    <Modal
      styles={{ body: editModalStyle(cloudFilesystem) }}
      centered
      title={
        <>
          <Icon name={icon} /> {verb} "{cloudFilesystem.title}"{" "}
          {cloudFilesystem.mount ? "from" : "at"}{" "}
          <Mountpoint {...cloudFilesystem} />?
        </>
      }
      open={open}
      onCancel={() => setOpen(false)}
      footer={[
        <Button key="cancel" onClick={() => setOpen(false)}>
          <CancelText />
        </Button>,
        <Button
          ref={buttonRef}
          key="ok"
          type={cloudFilesystem.mount ? "default" : "primary"}
          danger={cloudFilesystem.mount}
          disabled={mounting}
          onClick={doToggleMount}
        >
          <Icon name={icon} /> {verb}{" "}
          {mounting ? <Spin style={{ marginLeft: "15px" }} /> : undefined}
        </Button>,
      ]}
    >
      <div>
        <p>
          Are you sure you want to{" "}
          {cloudFilesystem.mount ? "unmount" : "automount"} this cloud
          filesystem?
          {cloudFilesystem.mount
            ? " The file system may be currently mounted so make sure no applications have anything in this filesystem open to avoid data loss. "
            : " "}
          {cloudFilesystem.mount ? "Unmounting" : "Automatic mounting"}{" "}
          typically takes about <b>15 seconds</b>.
        </p>
        <Alert
          showIcon
          style={{ margin: "10px 0" }}
          type="warning"
          message={<b>Cloud File Systems Only Visible From Compute Servers</b>}
          description={
            <>
              Currently cloud file systems can only be used from compute
              servers, i.e., from a Jupyter notebook or terminal that is set to
              use a compute server or from the file browser set to explore a
              compute server.
            </>
          }
        />
        {!cloudFilesystem.mount && (
          <p style={{ color: "#666" }}>
            <b>WARNING:</b> When a cloud file system is first created or has not
            been used for a while, it can take several minutes to automount in a
            running project while{" "}
            <A href="https://cloud.google.com/iam/docs/access-change-propagation">
              security policies
            </A>{" "}
            propagate.
          </p>
        )}
      </div>
      <ShowError error={error} setError={setError} />
    </Modal>
  );
}
