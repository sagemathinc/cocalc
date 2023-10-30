import ComputeServer from "./compute-server";
import CreateComputeServer from "./create-compute-server";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { cmp } from "@cocalc/util/misc";
import { availableClouds } from "./config";
import { Input, Checkbox, Radio, Typography } from "antd";
import { useState } from "react";
const { Search } = Input;
import { search_match, search_split } from "@cocalc/util/misc";
import {
  SortableList,
  SortableItem,
  DragHandle,
} from "@cocalc/frontend/components/sortable-list";

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

function ComputeServerTable({ computeServers, project_id, account_id }) {
  const [search, setSearch] = useState<string>("");
  const [showDeleted, setShowDeleted] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<"id" | "title" | "custom">(
    localStorage.compute_server_sort ?? "custom",
  );
  if (!computeServers || computeServers.size == 0) {
    return (
      <CreateComputeServer
        project_id={project_id}
        onCreate={() => setSearch("")}
      />
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
    if (a == b) return 0;
    const cs_a = computeServers.get(a);
    const cs_b = computeServers.get(b);
    if (sortBy == "custom") {
      return -cmp(cs_a.get("last_edited") ?? 0, cs_b.get("last_edited") ?? 0);
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
    v.push(<SortableItem id={id}>{renderItem(id)}</SortableItem>);
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
        onDragStop={(oldIndex, newIndex) => console.log(oldIndex, newIndex)}
      >
        {v}
      </SortableList>
    </div>
  );
}
