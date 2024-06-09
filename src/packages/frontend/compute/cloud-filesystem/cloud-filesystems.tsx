/*
Component that shows a list of all cloud filesystems:

- in a project
- associated to an account
*/

import { useEffect, useRef, useState } from "react";
import { getCloudFilesystems } from "./api";
import useCounter from "@cocalc/frontend/app-framework/counter-hook";
import ShowError from "@cocalc/frontend/components/error";
import type { CloudFilesystem as CloudFilesystemType } from "@cocalc/util/db-schema/cloud-filesystems";
import { Button, Spin } from "antd";
import CreateCloudFilesystem from "./create";
import CloudFilesystem from "./cloud-filesystem";
import { Icon } from "@cocalc/frontend/components/icon";
import { cmp } from "@cocalc/util/misc";

interface Props {
  // if not given, shows global list across all projects you collab on
  project_id?: string;
}

export default function CloudFilesystems({ project_id }: Props) {
  const { val: counter, inc: refresh } = useCounter();
  const [error, setError] = useState<string>("");
  const [cloudFilesystems, setCloudFilesystems] = useState<
    CloudFilesystemType[] | null
  >(null);
  const scheduledRefresh = useRef<boolean>(false);

  useEffect(() => {
    console.log("refreshing list of filesystems", scheduledRefresh.current);
    (async () => {
      try {
        const c = await getCloudFilesystems({ project_id });
        c.sort((x, y) => {
          const d = cmp(x.position ?? 0, y.position ?? 0);
          if (d) return d;
          return -cmp(x.id ?? 0, y.id ?? 0);
        });
        setCloudFilesystems(c);

        if (!scheduledRefresh.current) {
          // if a filesystem is currently being deleted, we refresh
          // again in 30s.
          for (const x of c) {
            if (x.deleting) {
              console.log("scheduling a refresh");
              setTimeout(() => {
                scheduledRefresh.current = false;
                refresh();
              }, 30000);
              scheduledRefresh.current = true;
              break;
            }
          }
        }
      } catch (err) {
        setError(`${err}`);
      }
    })();
  }, [counter]);

  if (cloudFilesystems == null) {
    return <Spin />;
  }

  return (
    <div>
      <Button style={{ float: "right" }} onClick={refresh}>
        <Icon name="refresh" />
        Refresh
      </Button>
      <h2>Cloud Filesystems</h2>
      <div style={{ margin: "5px 0" }}>
        {project_id
          ? ""
          : "All Cloud Filesystems you own across your projects."}
      </div>
      <ShowError error={error} setError={setError} />
      {project_id != null && cloudFilesystems != null && (
        <CreateCloudFilesystem
          project_id={project_id}
          cloudFilesystems={cloudFilesystems}
          refresh={refresh}
        />
      )}
      {cloudFilesystems.map((cloudFilesystem) => (
        <CloudFilesystem
          style={{ margin: "10px 0" }}
          key={cloudFilesystem.id}
          cloudFilesystem={cloudFilesystem}
          refresh={refresh}
          showProject={project_id == null}
        />
      ))}
    </div>
  );
}
