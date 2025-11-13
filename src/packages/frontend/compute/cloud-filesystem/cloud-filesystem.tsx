import { Card } from "antd";
import { useState } from "react";
import type { CloudFilesystem as CloudFilesystemType } from "@cocalc/util/db-schema/cloud-filesystems";
import CloudFilesystemAvatar from "./avatar";
import CloudFilesystemCardTitle from "./card-title";
import ShowError from "@cocalc/frontend/components/error";
import { ProjectTitle } from "@cocalc/frontend/projects/project-title";
import DeleteCloudFilesystem from "./delete-filesystem";
import MountCloudFilesystem from "./mount-filesystem";
import EditMountpoint from "./edit-mountpoint";
import EditTitleAndColor from "./edit-title-and-color";
import EditLock from "./edit-lock";
import EditTrashDays from "./edit-trash-days";
import EditBucketStorageClass from "./edit-bucket-storage-class";
import EditMountOptions from "./edit-mount-options";
import EditProject from "./edit-project";
import { TimeAgo } from "@cocalc/frontend/components";
import { human_readable_size } from "@cocalc/util/misc";
import Metrics from "./metrics";
import { HelpModal } from "./help";

interface Props {
  cloudFilesystem: CloudFilesystemType;
  style?;
  refresh?;
  showProject?: boolean;
  editable?: boolean;
}

export default function CloudFilesystem({
  style,
  refresh,
  cloudFilesystem,
  showProject,
  editable,
}: Props) {
  const [error, setError] = useState<string>("");
  const { color, deleting } = cloudFilesystem;
  const [showMetrics, setShowMetrics] = useState<boolean>(false);
  const [showDelete, setShowDelete] = useState<boolean>(false);
  const [showHelp, setShowHelp] = useState<boolean>(false);
  const [showMount, setShowMount] = useState<boolean>(false);
  const [showEditMountpoint, setShowEditMountpoint] = useState<boolean>(false);
  const [showEditTitleAndColor, setShowEditTitleAndColor] =
    useState<boolean>(false);
  const [showEditLock, setShowEditLock] = useState<boolean>(false);
  const [showEditTrashDays, setShowEditTrashDays] = useState<boolean>(false);
  const [showEditBucketStorageClass, setShowEditBucketStorageClass] =
    useState<boolean>(false);
  const [showEditMountOptions, setShowEditMountOptions] =
    useState<boolean>(false);
  const [showEditProject, setShowEditProject] = useState<boolean>(false);
  const show = editable
    ? {
        setShowDelete,
        setShowHelp,
        setShowMount,
        setShowEditMountpoint,
        setShowEditTitleAndColor,
        setShowEditLock,
        setShowEditTrashDays,
        setShowEditBucketStorageClass,
        setShowEditMountOptions,
        setShowEditProject,
        setShowMetrics,
        showMetrics,
      }
    : undefined;

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
      {editable && (
        <>
          {showDelete && (
            <DeleteCloudFilesystem
              cloudFilesystem={cloudFilesystem}
              open={showDelete}
              setOpen={setShowDelete}
              refresh={refresh}
            />
          )}
          {showMount && (
            <MountCloudFilesystem
              cloudFilesystem={cloudFilesystem}
              open={showMount}
              setOpen={setShowMount}
              refresh={refresh}
            />
          )}
          {showEditMountpoint && (
            <EditMountpoint
              cloudFilesystem={cloudFilesystem}
              open={showEditMountpoint}
              setOpen={setShowEditMountpoint}
              refresh={refresh}
            />
          )}
          {showHelp && <HelpModal open setOpen={setShowHelp} />}
          {showEditTitleAndColor && (
            <EditTitleAndColor
              cloudFilesystem={cloudFilesystem}
              open={showEditTitleAndColor}
              setOpen={setShowEditTitleAndColor}
              refresh={refresh}
            />
          )}
          {showEditLock && (
            <EditLock
              cloudFilesystem={cloudFilesystem}
              open={showEditLock}
              setOpen={setShowEditLock}
              refresh={refresh}
            />
          )}
          {showEditTrashDays && (
            <EditTrashDays
              cloudFilesystem={cloudFilesystem}
              open={showEditTrashDays}
              setOpen={setShowEditTrashDays}
              refresh={refresh}
            />
          )}
          {showEditBucketStorageClass && (
            <EditBucketStorageClass
              cloudFilesystem={cloudFilesystem}
              open={showEditBucketStorageClass}
              setOpen={setShowEditBucketStorageClass}
              refresh={refresh}
            />
          )}
          {showEditMountOptions && (
            <EditMountOptions
              cloudFilesystem={cloudFilesystem}
              open={showEditMountOptions}
              setOpen={setShowEditMountOptions}
              refresh={refresh}
            />
          )}
          {showEditProject && (
            <EditProject
              cloudFilesystem={cloudFilesystem}
              open={showEditProject}
              setOpen={setShowEditProject}
              refresh={refresh}
            />
          )}
        </>
      )}
      <Card.Meta
        avatar={
          <CloudFilesystemAvatar
            cloudFilesystem={cloudFilesystem}
            setShowMetrics={setShowMetrics}
            showMetrics={showMetrics}
          />
        }
        title={
          <CloudFilesystemCardTitle
            cloudFilesystem={cloudFilesystem}
            setError={setError}
            refresh={refresh}
            show={show}
          />
        }
        description={
          <div style={{ color: "#666" }}>
            <ShowError setError={setError} error={error} />
            Cloud File System{" "}
            <BytesUsed {...cloudFilesystem} show={show?.setShowMetrics} />,{" "}
            <Compression {...cloudFilesystem} />{" "}
            <BlockSize {...cloudFilesystem} />,{" "}
            {cloudFilesystem.mount ? "mounted" : "which would mount"} at{" "}
            <Mountpoint
              {...cloudFilesystem}
              show={show?.setShowEditMountpoint}
            />
            ,{" "}
            <Bucket
              {...cloudFilesystem}
              show={show?.setShowEditBucketStorageClass}
            />
            , <LastEdited {...cloudFilesystem} />.
            {showProject && (
              <ProjectTitle project_id={cloudFilesystem.project_id} />
            )}
            {showMetrics && <Metrics id={cloudFilesystem.id} />}
          </div>
        }
      />
    </Card>
  );
}

export function Mountpoint({
  mountpoint,
  show,
}: {
  mountpoint: string;
  show?;
}) {
  return (
    <span
      style={{ cursor: show != null ? "pointer" : undefined }}
      onClick={show}
    >
      <code>~/{mountpoint}</code>
    </span>
  );
}

function BlockSize({ block_size }) {
  return <>block size {block_size ?? 4} MB</>;
}

function Compression({ compression }) {
  if (compression == "lz4") {
    return <>with LZ4 compression and</>;
  } else if (compression == "zlib") {
    return <>with ZLIB compression and</>;
  } else {
    return <>with no compression and</>;
  }
}

function Bucket({ bucket_location, bucket_storage_class, show }) {
  return (
    <>
      stored in a{" "}
      <span style={{ cursor: "pointer" }} onClick={show}>
        {(bucket_storage_class ?? "standard").split("-").join(" ")} bucket
      </span>{" "}
      in <Location bucket_location={bucket_location} />
    </>
  );
}

function LastEdited({ last_edited }: { last_edited? }) {
  if (!last_edited) {
    return <>not used</>;
  }
  const d = new Date(last_edited);
  const recent = d >= new Date(Date.now() - 5 * 60 * 1000);
  return <>last edited {recent ? "recently" : <TimeAgo date={d} />}</>;
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

function BytesUsed({ bytes_used, show }: { bytes_used?; show }) {
  return (
    <span style={{ cursor: "pointer" }} onClick={() => show(true)}>
      storing{" "}
      <span style={{ color: "#666", fontWeight: "bold" }}>
        {human_readable_size(bytes_used ?? 0)}
      </span>
    </span>
  );
}
