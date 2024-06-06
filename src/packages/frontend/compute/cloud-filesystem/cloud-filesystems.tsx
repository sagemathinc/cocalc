/*
Component that shows a list of all cloud filesystems:

- in a project
- associated to an account
*/

import { useEffect, useState } from "react";
import { getCloudFilesystems } from "./api";
import useCounter from "@cocalc/frontend/app-framework/counter-hook";
import ShowError from "@cocalc/frontend/components/error";
import type { CloudFilesystem } from "@cocalc/util/db-schema/cloud-filesystems";
import { Button } from "antd";

interface Props {
  // if not given, shows global list across all projects you collab on
  project_id?: string;
}

export default function CloudFilesystems({ project_id }: Props) {
  const { val: counter, inc: refresh } = useCounter();
  const [error, setError] = useState<string>("");
  const [cloudFilesystems, setCloudFilesystems] = useState<
    CloudFilesystem[] | null
  >(null);

  useEffect(() => {
    (async () => {
      try {
        const c = await getCloudFilesystems({ project_id });
        setCloudFilesystems(c);
      } catch (err) {
        setError(`${err}`);
      }
    })();
  }, [counter]);

  return (
    <div>
      <Button onClick={refresh}>Refresh</Button>
      <ShowError error={error} setError={setError} />
      <pre>{JSON.stringify(cloudFilesystems ?? "loading", undefined, 2)}</pre>
    </div>
  );
}
