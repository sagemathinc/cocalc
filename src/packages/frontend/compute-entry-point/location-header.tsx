import Inline from "@cocalc/frontend/compute/inline";

export default function LocationHeader({
  project_id,
  compute_server_id,
  currentFile,
  style,
}) {
  if (!project_id) {
    return null;
  }
  return (
    <div style={style}>
      <Inline titleOnly id={compute_server_id} />{" "}
      {currentFile ? " - " : ""} {currentFile}
    </div>
  );
}
