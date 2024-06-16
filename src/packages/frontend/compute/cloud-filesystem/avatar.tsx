import { Icon } from "@cocalc/frontend/components/icon";
import { human_readable_size } from "@cocalc/util/misc";

export default function CloudFilesystemAvatar({ cloudFilesystem }) {
  const { color, id } = cloudFilesystem;
  return (
    <div style={{ width: "64px", marginBottom: "-20px" }}>
      <Icon
        name={"disk-round"}
        style={{ fontSize: "30px", color: color ?? "#666" }}
      />
      <div style={{ color: "#888" }}>Id: {id}</div>
      <div style={{ color: "#888" }}>
        {human_readable_size(cloudFilesystem.bytes_used ?? 0)}
      </div>
    </div>
  );
}
