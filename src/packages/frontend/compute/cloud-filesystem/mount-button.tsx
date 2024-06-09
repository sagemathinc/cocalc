import { Button, Spin, Popconfirm } from "antd";
import { editCloudFilesystem } from "./api";
import { useState } from "react";
import { Icon } from "@cocalc/frontend/components/icon";
import { A } from "@cocalc/frontend/components/A";

interface Props {
  cloudFilesystem;
  setError;
  refresh?;
}

export default function MountButton({
  cloudFilesystem,
  setError,
  refresh,
}: Props) {
  const [changing, setChanging] = useState<boolean>(false);
  const toggleMount = async () => {
    try {
      setChanging(true);
      await editCloudFilesystem({
        id: cloudFilesystem.id,
        mount: !cloudFilesystem.mount,
      });
    } catch (err) {
      setError(`${err}`);
    } finally {
      setChanging(false);
      refresh?.();
    }
  };
  if (cloudFilesystem.deleting) {
    return (
      <Popconfirm
        title={
          <div style={{ maxWidth: "400px" }}>
            The Google Cloud Storage bucket is currently being deleted.
            Depending on how much data you have, this can take a long time. It
            is managed entirely on the backend using the{" "}
            <A href="https://cloud.google.com/storage-transfer-service">
              Storage Transfer Service
            </A>
            , so you do not need to keep your browser open.
          </div>
        }
      >
        <Button
          danger
          style={{
            fontWeight: 600,
            fontSize: "16px",
          }}
          type="text"
        >
          Deleting... <Spin style={{ marginLeft: "15px" }} />
        </Button>
      </Popconfirm>
    );
  }

  return (
    <Popconfirm
      title={
        <div style={{ maxWidth: "400px" }}>
          Are you sure you want to {cloudFilesystem.mount ? "unmount" : "mount"}{" "}
          this filesystem? Expect this to take about 30 seconds to appear on any
          running compute server.
        </div>
      }
      onConfirm={toggleMount}
      okText={cloudFilesystem.mount ? "Unmount" : "Mount"}
      cancelText="No"
    >
      <Button
        disabled={changing}
        style={{
          fontWeight: 600,
          fontSize: "16px",
          color: cloudFilesystem.mount ? "#389E0D" : "#FF4B00",
        }}
        type="text"
      >
        <Icon
          name={cloudFilesystem.mount ? "run" : "stop"}
          style={{ marginRight: "5px" }}
        />
        {cloudFilesystem.mount ? "Mounted" : "Not Mounted"}
        {changing ? <Spin style={{ marginLeft: "15px" }} /> : undefined}
      </Button>
    </Popconfirm>
  );
}
