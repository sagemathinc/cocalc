import { Button, Spin } from "antd";
import { editCloudFilesystem } from "./api";
import { useState } from "react";

export default function MountButton({ cloudFilesystem, setError }) {
  const [changing, setChanging] = useState<boolean>(false);
  const toggleMount = async () => {
    try {
      setChanging(true);
      console.log(1);
      await editCloudFilesystem({
        id: cloudFilesystem.id,
        mount: !cloudFilesystem.mount,
      });
      console.log(2);
    } catch (err) {
      setError(`${err}`);
    } finally {
      setChanging(false);
    }
  };
  return (
    <Button
      disabled={changing}
      style={{ fontWeight: 600, fontSize: "16px", color: "#666" }}
      type="text"
      onClick={toggleMount}
    >
      {cloudFilesystem.mount ? "Mounted" : "Not Mounted"}
      {changing ? <Spin style={{ marginLeft: "15px" }} /> : undefined}
    </Button>
  );
}
