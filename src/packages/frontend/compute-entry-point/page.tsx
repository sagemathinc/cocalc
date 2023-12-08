import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { useEffect, useState } from "react";
import { ComputeServers } from "@cocalc/frontend/compute";
import { Layout } from "antd";
const { Header, Footer, Content } = Layout;
import { AppLogo } from "@cocalc/frontend/app/logo";
import { Avatar } from "@cocalc/frontend/account/avatar/avatar";
import CreateProject from "./create-project";
import Explorer from "./explorer";
import CurrentFile from "./current-file";
import LocationHeader from "./location-header";

export function Page({}) {
  const [project_id, setProjectId0] = useState<string | null>(() => {
    if (
      !localStorage.computeProjectId ||
      localStorage.computeProjectId == "null" ||
      localStorage.computeProjectId == "undefined"
    ) {
      return null;
    }
    return localStorage.computeProjectId;
  });
  const [compute_server_id, setComputeServerId0] = useState<number | null>(
    () => {
      if (
        !localStorage.computeServerId ||
        localStorage.computeServerId == "null" ||
        localStorage.computeServerId == "undefined"
      ) {
        return null;
      }
      return parseInt(localStorage.computeServerId);
    },
  );
  const [currentFile, setCurrentFile0] = useState<string>(
    localStorage.computeCurrentFile ?? "",
  );

  // todo -- just for prototype purposes -- better to use url routing.
  const setProjectId = (project_id) => {
    localStorage.computeProjectId = project_id;
    setProjectId0(project_id);
  };
  const setComputeServerId = (compute_server_id) => {
    if (compute_server_id != null) {
      compute_server_id = parseInt(compute_server_id);
    }
    localStorage.computeServerId = compute_server_id;
    setComputeServerId0(compute_server_id);
  };
  const setCurrentFile = (currentFile) => {
    localStorage.computeCurrentFile = currentFile;
    setCurrentFile0(currentFile);
  };

  const projectMap = useTypedRedux("projects", "project_map");
  const account_id = useTypedRedux("account", "account_id");

  useEffect(() => {
    if (project_id != null || projectMap == null) return;
    setProjectId(getDefaultProjectId(projectMap, account_id));
  }, [projectMap]);

  return (
    <Layout style={{ height: "100vh" }}>
      <Header style={{ color: "white", fontSize: "12pt" }}>
        <div style={{ color: "white", display: "flex" }}>
          <div style={{ marginTop: "9px" }}>
            <AppLogo size={48} />
          </div>
          <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
            <LocationHeader
              project_id={project_id}
              compute_server_id={compute_server_id}
              currentFile={currentFile}
              setCurrentFile={setCurrentFile}
              setComputeServerId={setComputeServerId}
              setProjectId={setProjectId}
            />
          </div>
          <div style={{ marginTop: "4.5px" }}>
            <Avatar size={44} account_id={account_id} no_tooltip no_loading />
          </div>
        </div>
      </Header>
      <Content style={{ overflow: "auto" }} className="smc-vfill">
        {project_id != null &&
          project_id != "new" &&
          compute_server_id == null && (
            <ComputeServers
              project_id={project_id}
              hideHelp
              onSelect={(compute_server_id) => {
                setCurrentFile("");
                setComputeServerId(compute_server_id);
              }}
            />
          )}
        {project_id == "new" && <CreateProject onCreate={setProjectId} />}
        {project_id != null &&
          project_id != "new" &&
          compute_server_id != null && (
            <div className="smc-vfill">
              {currentFile ? (
                <CurrentFile
                  project_id={project_id}
                  currentFile={currentFile}
                />
              ) : (
                <Explorer
                  project_id={project_id}
                  compute_server_id={compute_server_id}
                />
              )}
            </div>
          )}
      </Content>
      <Footer style={{ borderTop: "1px solid #ccc" }}>
        <div style={{ textAlign: "center" }}>
          CoCalc – About – Products and Pricing – Status
        </div>
      </Footer>
    </Layout>
  );
}

function getDefaultProjectId(projectMap, account_id) {
  let p: any = undefined;
  for (const [_, project] of projectMap) {
    if (project.get("deleted")) {
      continue;
    }
    if (project.getIn(["users", account_id, "hide"])) {
      continue;
    }
    if (p == null) {
      p = project;
      continue;
    }
    if (project.get("last_active") >= p.get("last_active")) {
      p = project;
    }
  }
  return p?.get("project_id") ?? null;
}
