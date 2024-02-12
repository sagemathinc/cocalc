/*
This is like the doc-status, except the selected and desired compute
server isn't managed by the client.

This should not be used for terminals or jupyter! They are way more
subtle and complicated.
*/
import { ComputeServerDocStatus } from "./doc-status";
import { useEffect, useMemo, useState } from "react";
import { webapp_client } from "@cocalc/frontend/webapp-client";

// This code is a much simpler version of select-server-for-file.tsx
export function StandaloneComputeServerDocStatus({ project_id, path }) {
  const [id, setId] = useState<number | null>(null);
  const computeServerAssociations = useMemo(() => {
    return webapp_client.project_client.computeServers(project_id);
  }, []);
  useEffect(() => {
    const handleChange = async () => {
      try {
        const id =
          (await computeServerAssociations.getServerIdForPath(path)) ?? null;
        setId(id);
      } catch (err) {
        console.warn(err);
      }
    };
    computeServerAssociations.on("change", handleChange);
    (async () => {
      await handleChange();
    })();
    return () => {
      computeServerAssociations.removeListener("change", handleChange);
    };
  }, [project_id, path]);

  if (!id) {
    return null;
  }
  return (
    <ComputeServerDocStatus project_id={project_id} id={id} requestedId={id} />
  );
}
