import Inline from "@cocalc/frontend/compute/inline";
import { ProjectTitle } from "@cocalc/frontend/projects/project-title";
import { r_join } from "@cocalc/frontend/components/r_join";

export default function LocationHeader({
  project_id,
  compute_server_id,
  currentFile,
  style,
  setCurrentFile,
  setComputeServerId,
}) {
  if (!project_id || project_id == "new") {
    return null;
  }
  const v: JSX.Element[] = [];
  v.push(
    <span onClick={() => setComputeServerId(null)}>
      <ProjectTitle style={{ color: "white" }} project_id={project_id} />
    </span>,
  );

  if (compute_server_id != null) {
    v.push(
      <span onClick={() => setCurrentFile("")} style={{ cursor: "pointer" }}>
        <Inline titleOnly id={compute_server_id} />
      </span>,
    );
  }
  if (currentFile) {
    v.push(currentFile);
  }
  return <div style={style}>{r_join(v, " - ")}</div>;
}
