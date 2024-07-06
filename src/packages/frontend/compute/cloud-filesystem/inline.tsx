import { useCloudFilesystem } from "./hooks";
import ShowError from "@cocalc/frontend/components/error";
import { avatar_fontcolor } from "@cocalc/frontend/account/avatar/font-color";
import { ProjectTitle } from "@cocalc/frontend/projects/project-title";

interface Props {
  cloud_filesystem_id: number;
  showProject?: boolean;
}

export default function InlineCloudFilesystem({
  cloud_filesystem_id,
  showProject,
}: Props) {
  const [cloudFilesystem, error, setError] = useCloudFilesystem({
    cloud_filesystem_id,
  });

  if (cloudFilesystem == null) {
    return <span>Cloud File System</span>;
  }
  return (
    <span>
      Cloud File System{" "}
      <span
        style={{
          backgroundColor: cloudFilesystem.color,
          color: cloudFilesystem.color
            ? avatar_fontcolor(cloudFilesystem.color)
            : undefined,
        }}
      >
        {cloudFilesystem.title} (Id: {cloudFilesystem.project_specific_id})
      </span>
      {showProject && (
        <>
          {" "}
          in <ProjectTitle project_id={cloudFilesystem.project_id} />
        </>
      )}
      <ShowError error={error} setError={setError} />
    </span>
  );
}
