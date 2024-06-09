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
      <h2 style={{ textAlign: "center" }}>Cloud Filesystems</h2>
      <p style={{ maxWidth: "700px", margin: "15px auto" }}>
        CoCalc Cloud Filesystems are scalable distributed POSIX shared
        filesystems with fast local caching. They are mounted and usable
        simultaneously from all compute servers in a project. There are no
        limits on how much data you can store. You do not specify the size of a
        cloud filesystem in advance. The cost per GB is typically much less than
        a compute server disk, but you pay for how many operations you do.
      </p>

      <div style={{ margin: "5px 0" }}>
        {project_id
          ? ""
          : "All Cloud Filesystems you own across your projects are listed below."}
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
