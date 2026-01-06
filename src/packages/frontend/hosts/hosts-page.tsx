import { Layout } from "antd";
import { React } from "@cocalc/frontend/app-framework";
import { IS_MOBILE } from "@cocalc/frontend/feature";
import { HostCreateCard } from "./components/host-create-card";
import { HostCreatePanel } from "./components/host-create-panel";
import { HostDrawer } from "./components/host-drawer";
import { HostEditModal } from "./components/host-edit-modal";
import { HostList } from "./components/host-list";
import { SelfHostRemoveModal } from "./components/self-host-remove-modal";
import { SelfHostSetupModal } from "./components/self-host-setup-modal";
import { WRAP_STYLE } from "./constants";
import { useHostsPageViewModel } from "./hooks/use-hosts-page-view-model";

const CREATE_PANEL_WIDTH_STORAGE_KEY = "cocalc:hosts:createPanelWidth";
const DEFAULT_CREATE_PANEL_WIDTH = 420;
const MIN_CREATE_PANEL_WIDTH = 250;
const MAX_CREATE_PANEL_WIDTH = 640;

function clampCreatePanelWidth(width: number) {
  return Math.min(
    MAX_CREATE_PANEL_WIDTH,
    Math.max(MIN_CREATE_PANEL_WIDTH, width),
  );
}

function readCreatePanelWidth() {
  if (typeof window === "undefined") {
    return DEFAULT_CREATE_PANEL_WIDTH;
  }
  const raw = window.localStorage.getItem(CREATE_PANEL_WIDTH_STORAGE_KEY);
  const parsed = raw == null ? Number.NaN : Number(raw);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_CREATE_PANEL_WIDTH;
  }
  return clampCreatePanelWidth(parsed);
}

function persistCreatePanelWidth(width: number) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(
    CREATE_PANEL_WIDTH_STORAGE_KEY,
    String(clampCreatePanelWidth(width)),
  );
}

export const HostsPage: React.FC = () => {
  const { createVm, hostListVm, hostDrawerVm, editVm, setupVm, removeVm } =
    useHostsPageViewModel();
  const [createPanelWidth, setCreatePanelWidth] =
    React.useState(readCreatePanelWidth);
  React.useEffect(() => {
    persistCreatePanelWidth(createPanelWidth);
  }, [createPanelWidth]);

  if (IS_MOBILE) {
    return (
      <div className="smc-vfill" style={WRAP_STYLE}>
        <HostCreateCard vm={createVm} />
        <div style={{ marginTop: 16 }}>
          <HostList vm={hostListVm} />
        </div>
        <HostDrawer vm={hostDrawerVm} />
        <HostEditModal {...editVm} />
        <SelfHostSetupModal {...setupVm} />
        <SelfHostRemoveModal {...removeVm} />
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
        <HostCreatePanel
          width={createPanelWidth}
          setWidth={setCreatePanelWidth}
        >
          <HostCreateCard vm={createVm} />
        </HostCreatePanel>
        <Layout.Content
          style={{
            background: "white",
            padding: "16px 0 0 16px",
            minHeight: 0,
            overflow: "auto",
            borderLeft: "2px solid #ccc",
            zIndex: 1,
          }}
        >
          <HostList vm={hostListVm} />
        </Layout.Content>
      </Layout>
      <HostDrawer vm={hostDrawerVm} />
      <HostEditModal {...editVm} />
      <SelfHostSetupModal {...setupVm} />
      <SelfHostRemoveModal {...removeVm} />
    </div>
  );
};
