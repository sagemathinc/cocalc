import { Layout } from "antd";
import { React } from "@cocalc/frontend/app-framework";
import { IS_MOBILE } from "@cocalc/frontend/feature";
import { HostCreateCard } from "./components/host-create-card";
import { HostCreatePanel } from "./components/host-create-panel";
import { HostDrawer } from "./components/host-drawer";
import { HostEditModal } from "./components/host-edit-modal";
import { HostList } from "./components/host-list";
import { WRAP_STYLE } from "./constants";
import { useHostsPageViewModel } from "./hooks/use-hosts-page-view-model";


export const HostsPage: React.FC = () => {
  const { createVm, hostListVm, hostDrawerVm, editVm } = useHostsPageViewModel();
  const [createPanelWidth, setCreatePanelWidth] = React.useState(420);

  if (IS_MOBILE) {
    return (
      <div className="smc-vfill" style={WRAP_STYLE}>
        <HostCreateCard vm={createVm} />
        <div style={{ marginTop: 16 }}>
          <HostList vm={hostListVm} />
        </div>
        <HostDrawer vm={hostDrawerVm} />
        <HostEditModal {...editVm} />
      </div>
    );
  }

  return (
    <div className="smc-vfill" style={WRAP_STYLE}>
      <Layout
        hasSider
        style={{
          background: "white",
          height: "100%",
          display: "flex",
          flexDirection: "row",
          minHeight: 0,
        }}
      >
        <HostCreatePanel width={createPanelWidth} setWidth={setCreatePanelWidth}>
          <HostCreateCard vm={createVm} />
        </HostCreatePanel>
        <Layout.Content
          style={{
            background: "white",
            padding: "16px 0 0 16px",
            minHeight: 0,
            overflow: "auto",
          }}
        >
          <HostList vm={hostListVm} />
        </Layout.Content>
      </Layout>
      <HostDrawer vm={hostDrawerVm} />
      <HostEditModal {...editVm} />
    </div>
  );
};
