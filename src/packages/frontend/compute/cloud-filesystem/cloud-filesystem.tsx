import { Card } from "antd";
import { useState } from "react";
import type { CloudFilesystem as CloudFilesystemType } from "@cocalc/util/db-schema/cloud-filesystems";
import CloudFilesystemAvatar from "./avatar";
import CloudFilesystemCardTitle from "./card-title";
import ShowError from "@cocalc/frontend/components/error";
import { ProjectTitle } from "@cocalc/frontend/projects/project-title";
import DeleteCloudFilesystem from "./delete-filesystem";
import MountCloudFilesystem from "./mount-filesystem";

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
  const [showDelete, setShowDelete] = useState<boolean>(false);
  const [showMount, setShowMount] = useState<boolean>(false);

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
      <DeleteCloudFilesystem
        cloudFilesystem={cloudFilesystem}
        open={showDelete}
        setOpen={setShowDelete}
        refresh={refresh}
      />
      <MountCloudFilesystem
        cloudFilesystem={cloudFilesystem}
        open={showMount}
        setOpen={setShowMount}
        refresh={refresh}
      />
      <Card.Meta
        avatar={<CloudFilesystemAvatar cloudFilesystem={cloudFilesystem} />}
        title={
          <CloudFilesystemCardTitle
            cloudFilesystem={cloudFilesystem}
            setError={setError}
            refresh={refresh}
            setShowDelete={setShowDelete}
            setShowMount={setShowMount}
          />
        }
        description={
          <div style={{ color: "#666" }}>
            <ShowError setError={setError} error={error} />
            Cloud Filesystem with block size {cloudFilesystem.block_size ?? 4}MB
            mounted at <code>~/{cloudFilesystem.mountpoint}</code> stored in a{" "}
            <Bucket {...cloudFilesystem} />.
            {showProject && (
              <ProjectTitle project_id={cloudFilesystem.project_id} />
            )}
          </div>
        }
      />
    </Card>
  );
}

// function getCompression({ compression }) {
//   if (compression == "none") {
//     return "not compressed";
//   } else if (compression == "lz4") {
//     return "lz4 compressed";
//   } else if (compression == "zlib") {
//     return "zlib compressed";
//   } else {
//     return `${compression} compressed`;
//   }
// }

function Bucket({ bucket_location, bucket_storage_class }) {
  return (
    <>
      {(bucket_storage_class ?? "standard").split("-").join(" ")} bucket in{" "}
      <Location bucket_location={bucket_location} />
    </>
  );
}

function Location({ bucket_location }) {
  if (!bucket_location) {
    return <>unknown-region</>;
  }
  if (bucket_location.includes("-")) {
    return <>{bucket_location}</>;
  } else {
    return <>the {bucket_location.toUpperCase()} multiregion</>;
  }
}
