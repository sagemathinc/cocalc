import { Button, Spin, Popconfirm } from "antd";
import { editCloudFilesystem } from "./api";
import { useState } from "react";
import { Icon } from "@cocalc/frontend/components/icon";

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

  return (
    <Popconfirm
      title={`Are you sure you want to ${
        cloudFilesystem.mount ? "unmount" : "mount"
      } this filesystem?  Expect this to take about 30 seconds.`}
      onConfirm={toggleMount}
      okText="Yes"
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
          style={{ marginRight: "15px" }}
        />
        {cloudFilesystem.mount ? "Mounted" : "Not Mounted"}
        {changing ? <Spin style={{ marginLeft: "15px" }} /> : undefined}
      </Button>
    </Popconfirm>
  );
}
