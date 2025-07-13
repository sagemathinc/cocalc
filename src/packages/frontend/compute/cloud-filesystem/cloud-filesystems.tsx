/*
Component that shows a list of all cloud file systems:

- in a project
- associated to an account
*/

import { useEffect, useRef, useState } from "react";
import { editCloudFilesystem, getCloudFilesystems } from "./api";
import useCounter from "@cocalc/frontend/app-framework/counter-hook";
import ShowError from "@cocalc/frontend/components/error";
import type { CloudFilesystem as CloudFilesystemType } from "@cocalc/util/db-schema/cloud-filesystems";
import { Button, Spin } from "antd";
import CreateCloudFilesystem from "./create";
import CloudFilesystem from "./cloud-filesystem";
import { Icon } from "@cocalc/frontend/components/icon";
import { A } from "@cocalc/frontend/components/A";
import RefreshButton from "@cocalc/frontend/components/refresh";
import { cmp } from "@cocalc/util/misc";
import {
  SortableList,
  SortableItem,
  DragHandle,
} from "@cocalc/frontend/components/sortable-list";
// import {
//   get_local_storage,
//   set_local_storage,
// } from "@cocalc/frontend/misc/local-storage";
import { useTypedRedux } from "@cocalc/frontend/app-framework";

export type CloudFilesystems = {
  [id: number]: CloudFilesystemType;
};

interface Props {
  // if not given, shows global list across all projects you collab on
  project_id?: string;
  noTitle?: boolean;
}

export default function CloudFilesystems({ project_id, noTitle }: Props) {
  const { val: counter, inc: refresh } = useCounter();
  const [error, setError] = useState<string>("");
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [cloudFilesystems, setCloudFilesystems] =
    useState<CloudFilesystems | null>(null);
  const scheduledRefresh = useRef<boolean>(false);

  // todo -- other sorts later
  //   const [sortBy, setSortBy] = useState<
  //     "id" | "title" | "custom" | "edited" | "state"
  //   >((get_local_storage(`cloudfs-${project_id}`) ?? "custom") as any);
  const sortBy: string = "custom";

  const [ids, setIds] = useState<number[]>([]);
  const account_id = useTypedRedux("account", "account_id");

  const updateIds = (cloudFilesystems: CloudFilesystems | null) => {
    if (cloudFilesystems == null) {
      setIds([]);
      return;
    }
    const c = Object.values(cloudFilesystems);
    c.sort((x, y) => {
      const d = -cmp(x.position ?? 0, y.position ?? 0);
      if (d) return d;
      return -cmp(x.id ?? 0, y.id ?? 0);
    });
    const ids = c.map(({ id }) => id);
    setIds(ids);
  };

  useEffect(() => {
    (async () => {
      try {
        setRefreshing(true);
        const cloudFilesystems: CloudFilesystems = {};
        for (const cloudFilesystem of await getCloudFilesystems({
          project_id,
        })) {
          cloudFilesystems[cloudFilesystem.id] = cloudFilesystem;
        }
        setCloudFilesystems(cloudFilesystems);
        updateIds(cloudFilesystems);

        if (!scheduledRefresh.current) {
          // if a file system is currently being deleted, we refresh
          // again in 30s.
          for (const { deleting } of Object.values(cloudFilesystems)) {
            if (deleting) {
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
      } finally {
        setRefreshing(false);
      }
    })();
  }, [counter]);

  if (cloudFilesystems == null) {
    return <Spin />;
  }

  const renderItem = (id) => {
    const cloudFilesystem = cloudFilesystems[id];

    return (
      <div style={{ display: "flex" }}>
        {sortBy == "custom" && account_id == cloudFilesystem.account_id && (
          <div
            style={{
              fontSize: "20px",
              color: "#888",
              display: "flex",
              justifyContent: "center",
              flexDirection: "column",
              marginRight: "5px",
            }}
          >
            <DragHandle id={id} />
          </div>
        )}
        <CloudFilesystem
          style={{ marginBottom: "10px" }}
          key={`${id}`}
          cloudFilesystem={cloudFilesystem}
          refresh={refresh}
          showProject={project_id == null}
          editable={account_id == cloudFilesystem.account_id}
        />
      </div>
    );
  };

  const v: React.JSX.Element[] = [];
  for (const id of ids) {
    v.push(
      <SortableItem key={`${id}`} id={id}>
        {renderItem(id)}
      </SortableItem>,
    );
  }

  return (
    <div>
      <RefreshButton
        refresh={refresh}
        style={{ float: "right" }}
        refreshing={refreshing}
      />
      {!noTitle && <h2 style={{ textAlign: "center" }}>Cloud File Systems</h2>}
      <div
        style={{
          margin: "15px auto 30px auto",
          fontSize: "11pt",
          color: "#666",
        }}
      >
        <A href="https://doc.cocalc.com/cloud_file_system.html">
          CoCalc Cloud File Systems{" "}
        </A>
        are scalable distributed POSIX shared file systems with fast local
        caching. Use them simultaneously from all compute servers in this
        project. There are no limits on how much data you can store. You do not
        specify the size of a cloud file system in advance. The cost per GB is
        typically much less than a compute server disk, but you pay network
        usage and operations.
        <div style={{ float: "right" }}>
          <Button
            href="https://youtu.be/zYoldE2yS3I"
            target="_new"
            type="link"
            style={{ marginRight: "15px" }}
          >
            <Icon name="youtube" style={{ color: "red" }} />
            Short Demo
          </Button>
          <Button
            href="https://youtu.be/uk5eA5piQEo"
            target="_new"
            type="link"
            style={{ marginRight: "15px" }}
          >
            <Icon name="youtube" style={{ color: "red" }} />
            Long Demo
          </Button>
          <Button
            href="https://doc.cocalc.com/cloud_file_system.html"
            target="_new"
            type="link"
          >
            <Icon name="external-link" />
            Docs
          </Button>
        </div>
      </div>

      <div style={{ margin: "5px 0" }}>
        {project_id
          ? ""
          : "All Cloud File Systems you own across your projects are listed below."}
      </div>
      <ShowError error={error} setError={setError} />
      {project_id != null && cloudFilesystems != null && (
        <CreateCloudFilesystem
          project_id={project_id}
          cloudFilesystems={cloudFilesystems}
          refresh={refresh}
        />
      )}
      <SortableList
        disabled={sortBy != "custom"}
        items={ids}
        Item={({ id }) => renderItem(id)}
        onDragStop={(oldIndex, newIndex) => {
          let position;
          if (newIndex == ids.length - 1) {
            const last = cloudFilesystems[ids[ids.length - 1]];
            // putting it at the bottom, so subtract 1 from very bottom position
            position = (last.position ?? last.id) - 1;
          } else {
            // putting it above what was at position newIndex.
            if (newIndex == 0) {
              // very top
              const first = cloudFilesystems[ids[0]];
              // putting it at the bottom, so subtract 1 from very bottom position
              position = (first.position ?? first.id) + 1;
            } else {
              // not at the very top: between two
              let x, y;
              if (newIndex > oldIndex) {
                x = cloudFilesystems[ids[newIndex]];
                y = cloudFilesystems[ids[newIndex + 1]];
              } else {
                x = cloudFilesystems[ids[newIndex - 1]];
                y = cloudFilesystems[ids[newIndex]];
              }

              const x0 = x.position ?? x.id;
              const y0 = y.position ?? y.id;
              // TODO: yes, positions could get too close like with compute servers
              position = (x0 + y0) / 2;
            }
          }
          // update UI
          const id = ids[oldIndex];
          const cur = { ...cloudFilesystems[id], position };
          const cloudFilesystems1 = { ...cloudFilesystems, [id]: cur };
          setCloudFilesystems(cloudFilesystems1);
          updateIds(cloudFilesystems1);
          // update Database
          (async () => {
            try {
              await editCloudFilesystem({ id, position });
            } catch (err) {
              console.warn(err);
            }
          })();
        }}
      >
        {v}
      </SortableList>
    </div>
  );
}
