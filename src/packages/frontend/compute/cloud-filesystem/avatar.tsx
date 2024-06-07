import { Icon } from "@cocalc/frontend/components/icon";
import CloudFilesystemLog from "./log";
import MountState from "./mount-state";

export default function CloudFilesystemAvatar({ cloudFilesystem }) {
  const { color, id } = cloudFilesystem;
  return (
    <div style={{ width: "64px", marginBottom: "-20px" }}>
      <Icon
        name={"disk-round"}
        style={{ fontSize: "30px", color: color ?? "#666" }}
      />
      {<div style={{ color: "#888" }}>Id: {id}</div>}
      {<CloudFilesystemLog id={id} />}
      <MountState cloudFilesystem={cloudFilesystem} />
    </div>
  );
}
