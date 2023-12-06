import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { useEffect, useMemo, useState } from "react";
import { ComputeServers } from "@cocalc/frontend/compute";
import Inline from "@cocalc/frontend/compute/inline";
import { Button, Divider, Layout } from "antd";
const { Header, Footer, Sider, Content } = Layout;
import { SelectProject } from "@cocalc/frontend/projects/select-project";
import { AppLogo } from "@cocalc/frontend/app/logo";
import { Avatar } from "@cocalc/frontend/account/avatar/avatar";
import CreateProject from "./create-project";
import Explorer from "./explorer";
import OpenFiles from "./open-files";
import CurrentFile from "./current-file";
import { Icon } from "@cocalc/frontend/components";
import LocationHeader from "./location-header";
import { webapp_client } from "@cocalc/frontend/webapp-client";

export function Page({}) {
  const [project_id, setProjectId0] = useState<string | undefined>(
    localStorage.computeProjectId,
  );
  const computeServerAssociations = useMemo(() => {
    return webapp_client.project_client.computeServers(project_id);
  }, [project_id]);
  const [compute_server_id, setComputeServerId0] = useState<number | null>(
    () => {
      if (
        !localStorage.computeServerId ||
        localStorage.computeServerId == "null"
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
    const p = getDefaultProject(projectMap, account_id);
    if (p != null) {
      setProjectId(p.get("project_id"));
    }
  }, [projectMap]);

  return (
    <Layout style={{ height: "100vh" }}>
      <Header style={{ color: "white", fontSize: "12pt" }}>
        <div style={{ color: "white", display: "flex" }}>
          <div style={{ marginTop: "9px" }}>
            <AppLogo size={48} />
          </div>
          <div style={{ flex: 1 }}>
            <LocationHeader
              style={{ color: "white", textAlign: "center" }}
              project_id={project_id}
              compute_server_id={compute_server_id}
              currentFile={currentFile}
              setCurrentFile={setCurrentFile}
              setComputeServerId={setComputeServerId}
            />
          </div>
          <div style={{ marginTop: "4.5px" }}>
            <Avatar size={44} account_id={account_id} no_tooltip no_loading />
          </div>
        </div>
      </Header>
      <Layout hasSider>
        <Sider theme={"light"} style={{ padding: "15px" }}>
          <div>
            <div
              style={{
                color: "#666",
                textAlign: "center",
                marginBottom: "5px",
              }}
            >
              Projects
            </div>
            <SelectProject
              value={project_id == "new" ? undefined : project_id}
              onChange={(project_id) => {
                setProjectId(project_id);
                setComputeServerId(project_id == "new" ? null : 0);
              }}
              minimal
              onCreate={() => {}}
            />
            {compute_server_id != null && (
              <div style={{ textAlign: "center" }}>
                <Divider />
                <div>
                  {compute_server_id > 0 ? (
                    <Inline id={compute_server_id} />
                  ) : (
                    "Shared Server"
                  )}
                </div>
                <Button
                  style={{ marginTop: "5px" }}
                  onClick={() => setComputeServerId(null)}
                >
                  Close
                </Button>
              </div>
            )}
            {compute_server_id != null &&
              project_id != null &&
              project_id != "new" && (
                <div>
                  <Divider />
                  <div style={{ textAlign: "center" }}>
                    <Button
                      type="text"
                      style={{ marginBottom: "5px", color: "#666" }}
                      onClick={() => setCurrentFile("")}
                    >
                      <Icon name="files" /> Files...
                    </Button>
                  </div>{" "}
                  <OpenFiles
                    project_id={project_id}
                    currentFile={currentFile}
                    setCurrentFile={(path) => {
                      setCurrentFile(path);
                      if (path && path.endsWith(".ipynb")) {
                        computeServerAssociations.connectComputeServerToPath({
                          id: compute_server_id,
                          path,
                        });
                      }
                    }}
                  />
                </div>
              )}
          </div>
        </Sider>
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
      </Layout>
      <Footer style={{ borderTop: "1px solid #ccc" }}>
        <div style={{ textAlign: "center" }}>
          CoCalc – About – Products and Pricing – Status
        </div>
      </Footer>
    </Layout>
  );
}

function getDefaultProject(projectMap, account_id) {
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
  if (p != null) {
    return p.get("project_id");
  }
}
