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
const CREATE_PANEL_OPEN_STORAGE_KEY = "cocalc:hosts:createPanelOpen";
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

function readCreatePanelOpen() {
  if (typeof window === "undefined") {
    return true;
  }
  const raw = window.localStorage.getItem(CREATE_PANEL_OPEN_STORAGE_KEY);
  if (raw === "false") {
    return false;
  }
  return true;
}

function persistCreatePanelOpen(open: boolean) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(
    CREATE_PANEL_OPEN_STORAGE_KEY,
    open ? "true" : "false",
  );
}

export const HostsPage: React.FC = () => {
  const { createVm, hostListVm, hostDrawerVm, editVm, setupVm, removeVm } =
    useHostsPageViewModel();
  const [createPanelWidth, setCreatePanelWidth] =
    React.useState(readCreatePanelWidth);
  const [createPanelOpen, setCreatePanelOpen] =
    React.useState(readCreatePanelOpen);
  React.useEffect(() => {
    persistCreatePanelWidth(createPanelWidth);
  }, [createPanelWidth]);
  React.useEffect(() => {
    persistCreatePanelOpen(createPanelOpen);
  }, [createPanelOpen]);

  const toggleCreatePanel = React.useCallback(() => {
    setCreatePanelOpen((prev) => !prev);
  }, []);
  const showCreatePanel = !IS_MOBILE && createPanelOpen;

  if (IS_MOBILE) {
    return (
      <div className="smc-vfill" style={WRAP_STYLE}>
        <HostCreateCard vm={createVm} />
        <div style={{ marginTop: 16 }}>
          <HostList
            vm={{
              ...hostListVm,
              createPanelOpen: true,
              onToggleCreatePanel: undefined,
            }}
          />
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
        hasSider={showCreatePanel}
        style={{
          background: "white",
          height: "100%",
          display: "flex",
          flexDirection: "row",
          minHeight: 0,
        }}
      >
        {showCreatePanel && (
          <HostCreatePanel
            width={createPanelWidth}
            setWidth={setCreatePanelWidth}
            onHide={toggleCreatePanel}
          >
            <HostCreateCard vm={createVm} />
          </HostCreatePanel>
        )}
        <Layout.Content
          style={{
            background: "white",
            padding: showCreatePanel ? "16px 0 0 16px" : "16px 0 0 15px",
            minHeight: 0,
            overflow: "auto",
            borderLeft: showCreatePanel ? "2px solid #ccc" : "none",
            zIndex: 1,
          }}
        >
          <HostList
            vm={{
              ...hostListVm,
              createPanelOpen,
              onToggleCreatePanel: toggleCreatePanel,
            }}
          />
        </Layout.Content>
      </Layout>
      <HostDrawer vm={hostDrawerVm} />
      <HostEditModal {...editVm} />
      <SelfHostSetupModal {...setupVm} />
      <SelfHostRemoveModal {...removeVm} />
    </div>
  );
};
