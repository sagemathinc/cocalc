import { r_join } from "@cocalc/frontend/components/r_join";
import { SelectProject } from "@cocalc/frontend/projects/select-project";
import SelectComputeServer from "@cocalc/frontend/compute/select-server";
import OpenFiles from "./open-files";
import { Button } from "antd";

export default function LocationHeader({
  project_id,
  compute_server_id,
  currentFile,
  setProjectId,
  setComputeServerId,
  setCurrentFile,
}) {
  const v: JSX.Element[] = [];
  v.push(
    <div style={{ verticalAlign: "middle" }} key="project">
      <SelectProject
        allowClear
        style={{ display: "inline-block", width: "200px" }}
        value={project_id == "new" ? undefined : project_id}
        onChange={(project_id) => {
          setProjectId(project_id);
          setComputeServerId(null);
          setCurrentFile("");
        }}
        minimal
        onCreate={() => {}}
      />
    </div>,
  );

  if (compute_server_id != null && project_id != null && project_id != "new") {
    v.push(
      <div style={{ verticalAlign: "middle" }} key="compute-server">
        <div style={{ display: "inline-block" }}>
          <div style={{ display: "flex" }}>
            <SelectComputeServer
              style={{
                marginRight: "3px",
                marginTop: "1px",
                display: "inline-block",
              }}
              project_id={project_id}
              path={""}
            />
            <Button onClick={() => setComputeServerId(null)}>X</Button>
          </div>
        </div>
      </div>,
    );
  }
  if (compute_server_id != null && project_id != null && project_id != "new") {
    v.push(
      <div style={{ verticalAlign: "middle", width: "200px" }} key="file">
        <OpenFiles
          compute_server_id={compute_server_id}
          project_id={project_id}
          currentFile={currentFile}
          setCurrentFile={setCurrentFile}
        />
      </div>,
    );
  }
  return (
    <div style={{ display: "flex" }}>
      {r_join(v, <div style={{ width: "30px" }}></div>)}
    </div>
  );
}
