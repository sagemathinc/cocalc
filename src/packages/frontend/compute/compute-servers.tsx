import ComputeServer from "./compute-server";
import CreateComputeServer from "./create-compute-server";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { cmp } from "@cocalc/util/misc";
import { availableClouds } from "./config";
import { Input, Checkbox, Radio, Typography } from "antd";
import { useEffect, useState } from "react";
const { Search } = Input;
import { search_match, search_split } from "@cocalc/util/misc";
import {
  SortableList,
  SortableItem,
  DragHandle,
} from "@cocalc/frontend/components/sortable-list";
import { webapp_client } from "@cocalc/frontend/webapp-client";

export default function ComputeServers({ project_id }: { project_id: string }) {
  const computeServers = useTypedRedux({ project_id }, "compute_servers");
  const account_id = useTypedRedux("account", "account_id");

  return (
    <div style={{ paddingRight: "15px", fontSize: "11pt" }}>
      <Typography.Paragraph
        ellipsis={{
          expandable: true,
          rows: 2,
          symbol: "more",
        }}
      >
        Do you need affordable GPU's and high end VM's, root access, Docker, or
        to install commercial software? Compute servers are competitively priced
        pay as you go virtual machines where you can run Jupyter notebooks,
        terminals and web servers collaboratively, with full access to this
        project. You get
        <ul>
          <li>full root access and Internet access,</li>
          <li>
            dedicated GPU's, hundreds of very fast vCPU's, and thousands of GB
            of RAM
          </li>
          <li>
            to install free and commercial Linux software (e.g., MATLAB,
            Mathematica, any Docker container, etc.)
          </li>
          <li>a dedicated public ip address and domain name</li>
        </ul>
      </Typography.Paragraph>
      {availableClouds().length == 0 ? (
        <b>No Compute Server Clouds are currently enabled.</b>
      ) : (
        <ComputeServerTable
          computeServers={computeServers}
          project_id={project_id}
          account_id={account_id}
        />
      )}
    </div>
  );
}

function computeServerToSearch(computeServers, id) {
  return JSON.stringify(computeServers.get(id)).toLowerCase();
}

function ComputeServerTable({
  computeServers: computeServers0,
  project_id,
  account_id,
}) {
  const [computeServers, setComputeServers] = useState<any>(computeServers0);
  useEffect(() => {
    setComputeServers(computeServers0);
  }, [computeServers0]);

  const [search, setSearch] = useState<string>("");
  const [showDeleted, setShowDeleted] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<"id" | "title" | "custom">(
    localStorage.compute_server_sort ?? "custom",
  );
  if (!computeServers || computeServers.size == 0) {
    return (
      <div style={{ textAlign: "center" }}>
        <CreateComputeServer
          project_id={project_id}
          onCreate={() => setSearch("")}
        />
      </div>
    );
  }
  const search_words = search_split(search.toLowerCase());
  const ids: number[] = [];
  let numDeleted = 0;
  for (const [id] of computeServers) {
    const isDeleted = !!computeServers.getIn([id, "deleted"]);
    if (isDeleted) {
      numDeleted += 1;
    }
    if (showDeleted != isDeleted) {
      continue;
    }
    if (search_words.length > 0) {
      if (
        !search_match(computeServerToSearch(computeServers, id), search_words)
      ) {
        continue;
      }
    }
    ids.push(id);
  }
  ids.sort((a, b) => {
    if (a == b) {
      return 0;
    }
    const cs_a = computeServers.get(a);
    const cs_b = computeServers.get(b);
    if (sortBy == "custom") {
      return -cmp(
        cs_a.get("position") ?? cs_a.get("id"),
        cs_b.get("position") ?? cs_b.get("id"),
      );
    } else if (sortBy == "title") {
      return cmp(
        cs_a.get("title")?.toLowerCase(),
        cs_b.get("title")?.toLowerCase(),
      );
    } else {
      // sort by id
      return -cmp(cs_a.get("id"), cs_b.get("id"));
    }
  });

  const renderItem = (id) => {
    const data = computeServers.get(id).toJS();

    return (
      <div style={{ display: "flex" }}>
        {sortBy == "custom" && (
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
        <ComputeServer
          id={id}
          style={{ marginBottom: "15px" }}
          key={`${id}`}
          editable={account_id == data.account_id}
          {...data}
          setShowDeleted={setShowDeleted}
          setSearch={setSearch}
        />
      </div>
    );
  };

  const v: JSX.Element[] = [];
  for (const id of ids) {
    v.push(
      <SortableItem key={`${id}`} id={id}>
        {renderItem(id)}
      </SortableItem>,
    );
  }

  return (
    <div style={{ margin: "5px" }}>
      <div style={{ marginBottom: "15px" }}>
        {computeServers.size > 1 && (
          <Search
            allowClear
            placeholder="Filter servers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 250 }}
          />
        )}
        {computeServers.size > 1 && (
          <span style={{ marginLeft: "15px" }}>
            Sort:{" "}
            <Radio.Group
              value={sortBy}
              size="small"
              onChange={(e) => {
                setSortBy(e.target.value);
                // LAZY!
                try {
                  localStorage.compute_server_sort = e.target.value;
                } catch (_) {}
              }}
            >
              <Radio.Button value="custom">Custom</Radio.Button>
              <Radio.Button value="id">Id</Radio.Button>
              <Radio.Button value="title">Title</Radio.Button>
            </Radio.Group>
          </span>
        )}
        {numDeleted > 0 && (
          <Checkbox
            style={{ marginLeft: "10px", marginTop: "5px" }}
            checked={showDeleted}
            onChange={() => setShowDeleted(!showDeleted)}
          >
            Deleted ({numDeleted})
          </Checkbox>
        )}
      </div>
      <div style={{ margin: "15px 0", textAlign: "center" }} key="create">
        <CreateComputeServer
          project_id={project_id}
          onCreate={() => setSearch("")}
        />
      </div>
      <SortableList
        disabled={sortBy != "custom"}
        items={ids}
        Item={({ id }) => renderItem(id)}
        onDragStop={(oldIndex, newIndex) => {
          let position;
          if (newIndex == ids.length - 1) {
            const last = computeServers.get(ids[ids.length - 1]);
            // putting it at the bottom, so subtract 1 from very bottom position
            position = (last.get("position") ?? last.get("id")) - 1;
          } else {
            // putting it above what was at position newIndex.
            if (newIndex == 0) {
              // very top
              const first = computeServers.get(ids[0]);
              // putting it at the bottom, so subtract 1 from very bottom position
              position = (first.get("position") ?? first.get("id")) + 1;
            } else {
              // not at the very top: between two
              let x, y;
              if (newIndex > oldIndex) {
                x = computeServers.get(ids[newIndex]);
                y = computeServers.get(ids[newIndex + 1]);
              } else {
                x = computeServers.get(ids[newIndex - 1]);
                y = computeServers.get(ids[newIndex]);
              }

              const x0 = x.get("position") ?? x.get("id");
              const y0 = y.get("position") ?? y.get("id");
              // TODO: yes, positions could get too close and this doesn't work, and then
              // we have to globally reset them all.  This is done for jupyter etc.
              // not implemented here *yet*.
              position = (x0 + y0) / 2;
            }
          }
          const id = ids[oldIndex];
          let cur = computeServers.get(ids[oldIndex]);
          cur = cur.set("position", position);
          setComputeServers(computeServers.set(ids[oldIndex], cur));
          (async () => {
            try {
              await webapp_client.async_query({
                query: {
                  compute_servers: {
                    id,
                    project_id,
                    position,
                  },
                },
              });
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
