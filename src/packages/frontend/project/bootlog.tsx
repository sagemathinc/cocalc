import { webapp_client } from "@cocalc/frontend/webapp-client";
import { useState } from "react";
import { Spin } from "antd";
import { useProjectContext } from "./context";
import { useAsyncEffect } from "@cocalc/frontend/app-framework";

export default function Bootlog({
  compute_server_id,
}: {
  compute_server_id?: number;
}) {
  const { project_id } = useProjectContext();
  const [log, setLog] = useState<any>(null);

  useAsyncEffect(async () => {
    const log = await webapp_client.conat_client.projectBootlog({
      project_id,
      compute_server_id,
    });
    // maximally DUMB for now!
    setLog(log.getAll().reverse());
    log.on("change", () => {
      setLog(log.getAll().reverse());
    });

    return () => {
      // free up reference to the dstream
      log.close();
    };
  }, [project_id, compute_server_id]);

  if (log == null) {
    return <Spin />;
  }
  return (
    <pre style={{ maxHeight: "200px", minWidth: "450px" }}>
      {log.map((x) => JSON.stringify(x)).join("\n")}
    </pre>
  );
}
