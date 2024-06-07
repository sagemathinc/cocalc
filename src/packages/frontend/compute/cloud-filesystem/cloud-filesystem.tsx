import { Card } from "antd";
import { useState } from "react";
import type { CloudFilesystem as CloudFilesystemType } from "@cocalc/util/db-schema/cloud-filesystems";
import CloudFilesystemAvatar from "./avatar";
import CloudFilesystemCardTitle from "./card-title";
import ShowError from "@cocalc/frontend/components/error";
import { ProjectTitle } from "@cocalc/frontend/projects/project-title";

interface Props {
  cloudFilesystem: CloudFilesystemType;
  style?;
  refresh?;
  showProject?: boolean;
}

export default function CloudFilesystem({
  style,
  refresh,
  cloudFilesystem,
  showProject,
}: Props) {
  const [error, setError] = useState<string>("");
  const { color, deleting } = cloudFilesystem;
  return (
    <Card
      style={{
        opacity: deleting ? 0.5 : undefined,
        width: "100%",
        minWidth: "500px",
        border: `0.5px solid ${color ?? "#f0f0f0"}`,
        borderRight: `10px solid ${color ?? "#aaa"}`,
        borderLeft: `10px solid ${color ?? "#aaa"}`,
        ...style,
      }}
    >
      <Card.Meta
        avatar={<CloudFilesystemAvatar cloudFilesystem={cloudFilesystem} />}
        title={
          <CloudFilesystemCardTitle
            cloudFilesystem={cloudFilesystem}
            setError={setError}
            refresh={refresh}
          />
        }
        description={
          <div style={{ color: "#666" }}>
            <ShowError setError={setError} error={error} />
            Mountpoint: <code>~/{cloudFilesystem.mountpoint}</code> on all
            compute servers in{" "}
            {showProject ? (
              <ProjectTitle project_id={cloudFilesystem.project_id} />
            ) : (
              "this project"
            )}
            <br />
            Compression: {cloudFilesystem.compression?.toUpperCase() ?? "NONE"},
            Block Size: {cloudFilesystem.block_size ?? 4}MB
          </div>
        }
      />
    </Card>
  );
}
