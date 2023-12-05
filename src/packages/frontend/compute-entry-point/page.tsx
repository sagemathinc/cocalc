import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { useEffect, useState } from "react";
import { ComputeServers } from "@cocalc/frontend/compute";
import { Layout } from "antd";
const { Header, Footer, Sider, Content } = Layout;
import { SelectProject } from "@cocalc/frontend/projects/select-project";
import { AppLogo } from "@cocalc/frontend/app/logo";
import { Avatar } from "@cocalc/frontend/account/avatar/avatar";

export function Page({}) {
  const [project_id, setProjectId] = useState<string | undefined>(undefined);
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
            <div style={{ color: "#666" }}>Project</div>
            <SelectProject value={project_id} onChange={setProjectId} minimal />
          </div>
        </Sider>
        <Content style={{ overflow: "auto" }}>
          {project_id != null && (
            <ComputeServers project_id={project_id} hideHelp />
          )}
        </Content>
      </Layout>
      <Footer>
        <div style={{ textAlign: "center" }}>
          CoCalc – About – Products and Pricing – Status
        </div>
      </Footer>
    </Layout>
  );
}
