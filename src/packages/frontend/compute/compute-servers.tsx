import ComputeServer from "./compute-server";
import CreateComputeServer from "./create-compute-server";
import { useTypedRedux } from "@cocalc/frontend/app-framework";

export default function ComputeServers({ project_id }: { project_id: string }) {
  const computeServers = useTypedRedux({ project_id }, "compute_servers");
  const account_id = useTypedRedux("account", "account_id");

  return (
    <div>
      <p>
        Compute servers are{" "}
        <b>
          competitively priced very powerful unconstrained dedicated virtual
          machines,{" "}
        </b>
        in which you can be root, use a GPU, run Docker containers, and install
        arbitrary free and commercial software. Run your Jupyter notebooks and
        terminals collaboratively on compute servers. You pay by the millisecond
        only when the compute server is on.
      </p>
      <ComputeServerTable
        computeServers={computeServers}
        project_id={project_id}
        account_id={account_id}
      />
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
  ids.sort().reverse();
  for (const id of ids) {
    const data = computeServers.get(id).toJS();
    v.push(
      <ComputeServer
        style={{ marginBottom: "5px" }}
        key={`${id}`}
        editable={account_id == data.account_id}
        {...data}
      />,
    );
  }
  return <div style={{ margin: "5px" }}>{v}</div>;
}
