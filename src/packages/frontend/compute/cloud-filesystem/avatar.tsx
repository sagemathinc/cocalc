import { Icon } from "@cocalc/frontend/components/icon";
import { human_readable_size } from "@cocalc/util/misc";
import { Button } from "antd";

export default function CloudFilesystemAvatar({
  cloudFilesystem,
  showMetrics,
  setShowMetrics,
}) {
  const { color, project_specific_id } = cloudFilesystem;
  return (
    <div style={{ width: "64px", marginBottom: "-20px" }}>
      <Icon
        name={"disk-round"}
        style={{ fontSize: "30px", color: color ?? "#666" }}
      />
      <div style={{ color: "#888" }}>Id: {project_specific_id}</div>
      <div
        style={{ color: "#888", cursor: "pointer" }}
        onClick={() => {
          setShowMetrics(!showMetrics);
        }}
      >
        {human_readable_size(cloudFilesystem.bytes_used ?? 0)}
      </div>
      <Button
        style={{ marginLeft: "-5px" }}
        type={showMetrics ? "default" : "text"}
        onClick={() => {
          setShowMetrics(!showMetrics);
        }}
      >
        <Icon style={{ fontSize: "15pt" }} name="graph" />
      </Button>
    </div>
  );
}
