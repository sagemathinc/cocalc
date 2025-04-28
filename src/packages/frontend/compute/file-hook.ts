/*
Hook that returns the compute server that has been selected for a given document.
*/

import { useEffect, useMemo, useState } from "react";
import { webapp_client } from "@cocalc/frontend/webapp-client";

export default function useComputeServerId({
  project_id,
  path,
}): number | null {
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
  return id;
}
