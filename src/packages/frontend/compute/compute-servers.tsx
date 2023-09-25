import ComputeServer from "./compute-server";
import CreateComputeServer from "./create-compute-server";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { cmp } from "@cocalc/util/misc";
import { availableClouds } from "./config";
import { Input, Typography } from "antd";
import { useState } from "react";
const { Search } = Input;
import { search_match, search_split } from "@cocalc/util/misc";

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
  const v: JSX.Element[] = [
    <div style={{ margin: "15px 0", textAlign: "center" }}>
      <CreateComputeServer
        project_id={project_id}
        onCreate={() => setSearch("")}
      />
    </div>,
  ];
  const search_words = search_split(search.toLowerCase());
  const ids: number[] = [];
  for (const [id] of computeServers) {
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
    if (
      cs_a.get("account_id") == account_id &&
      cs_b.get("account_id") != account_id
    ) {
      return -1;
    }
    if (
      cs_a.get("account_id") != account_id &&
      cs_b.get("account_id") == account_id
    ) {
      return 1;
    }
    return -cmp(a, b);
  });
  for (const id of ids) {
    const data = computeServers.get(id).toJS();
    v.push(
      <ComputeServer
        style={{ marginBottom: "15px" }}
        key={`${id}`}
        editable={account_id == data.account_id}
        {...data}
      />,
    );
  }
  return (
    <div style={{ margin: "5px" }}>
      {computeServers.size > 1 && (
        <Search
          allowClear
          placeholder="Filter compute servers..."
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 300 }}
        />
      )}
      {v}
    </div>
  );
}
