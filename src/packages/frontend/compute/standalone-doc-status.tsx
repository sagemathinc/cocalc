/*
This is like the doc-status, except the selected and desired compute
server isn't managed by the client.

This should not be used for terminals or jupyter! They are way more
subtle and complicated.
*/
import { ComputeServerDocStatus } from "./doc-status";
import useComputeServerId from "./file-hook";

// This code is a much simpler version of select-server-for-file.tsx
export function StandaloneComputeServerDocStatus({ project_id, path }) {
  const id = useComputeServerId({ project_id, path });
  if (!id) {
    return null;
  }
  return (
    <ComputeServerDocStatus project_id={project_id} id={id} requestedId={id} />
  );
}
