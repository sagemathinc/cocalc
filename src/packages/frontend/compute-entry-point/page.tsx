import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { useEffect, useState } from "react";
import { ComputeServers } from "@cocalc/frontend/compute";
import Inline from "@cocalc/frontend/compute/inline";
import { Button, Divider, Layout } from "antd";
const { Header, Footer, Sider, Content } = Layout;
import { SelectProject } from "@cocalc/frontend/projects/select-project";
import { AppLogo } from "@cocalc/frontend/app/logo";
import { Avatar } from "@cocalc/frontend/account/avatar/avatar";
import CreateProject from "./create-project";
import Server from "./server";

export function Page({}) {
  const [project_id, setProjectId] = useState<string | undefined>(undefined);
  const [compute_server_id, setComputeServerId] = useState<number>(0);
  const projectMap = useTypedRedux("projects", "project_map");
  const account_id = useTypedRedux("account", "account_id");

  useEffect(() => {
    if (project_id != null || projectMap == null) return;
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
          <div style={{ flex: 1 }}></div>
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
              Project
            </div>
            <SelectProject
              value={project_id == "new" ? undefined : project_id}
              onChange={(project_id) => {
                setProjectId(project_id);
                setComputeServerId(0);
              }}
              minimal
              onCreate={() => {}}
            />
            {compute_server_id > 0 && (
              <div style={{ textAlign: "center" }}>
                <Divider />
                <Inline id={compute_server_id} />
                <Button
                  style={{ marginTop: "5px" }}
                  onClick={() => setComputeServerId(0)}
                >
                  Close
                </Button>
              </div>
            )}
          </div>
        </Sider>
        <Content style={{ overflow: "auto" }} className="smc-vfill">
          {project_id != null &&
            compute_server_id == 0 &&
            project_id != "new" && (
              <ComputeServers
                project_id={project_id}
                hideHelp
                onOpen={(compute_server_id) => {
                  setComputeServerId(compute_server_id);
                }}
              />
            )}
          {project_id == "new" && <CreateProject onCreate={setProjectId} />}
          {project_id != null &&
            project_id != "new" &&
            compute_server_id > 0 && (
              <Server
                project_id={project_id}
                compute_server_id={compute_server_id}
              />
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
