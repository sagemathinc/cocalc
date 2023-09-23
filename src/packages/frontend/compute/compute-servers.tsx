import ComputeServer from "./compute-server";
import CreateComputeServer from "./create-compute-server";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { cmp } from "@cocalc/util/misc";
import { availableClouds } from "./config";

export default function ComputeServers({ project_id }: { project_id: string }) {
  const computeServers = useTypedRedux({ project_id }, "compute_servers");
  const account_id = useTypedRedux("account", "account_id");

  return (
    <div style={{ paddingRight: "15px" }}>
      <p>
        Compute servers are{" "}
        <b>
          competitively priced very powerful unconstrained dedicated virtual
          machines,{" "}
        </b>
        in which you can be root, use a GPU, run Docker containers, and install
        arbitrary free and commercial software. Run your Jupyter notebooks and
        terminals collaboratively on compute servers. Pay as you go for storage
        of data and usage when the server is running.
      </p>
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

function ComputeServerTable({ computeServers, project_id, account_id }) {
  if (!computeServers || computeServers.size == 0) {
    return (
      <div style={{ textAlign: "center" }}>
        <CreateComputeServer project_id={project_id} />
      </div>
    );
  }
  const v: JSX.Element[] = [
    <div style={{ marginBottom: "10px" }}>
      <CreateComputeServer project_id={project_id} />
    </div>,
  ];
  const ids: number[] = [];
  for (const [id] of computeServers) {
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
  return <div style={{ margin: "5px" }}>{v}</div>;
}
