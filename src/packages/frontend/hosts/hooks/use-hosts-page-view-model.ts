import { Form, message } from "antd";
import { React } from "@cocalc/frontend/app-framework";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { useHostActions } from "./use-host-actions";
import { useHostAi } from "./use-host-ai";
import { useHostCatalog } from "./use-host-catalog";
import { useHostCreate } from "./use-host-create";
import { useHostCreateViewModel } from "./use-host-create-view-model";
import { useHostDrawerViewModel } from "./use-host-drawer-view-model";
import { useHostFeatureFlags } from "./use-host-feature-flags";
import { useHostForm } from "./use-host-form";
import { useHostFormValues } from "./use-host-form-values";
import { useHostListViewModel } from "./use-host-list-view-model";
import { useHosts } from "./use-hosts";
import { useHostLog } from "./use-host-log";
import { useHostProviders } from "./use-host-providers";
import { useHostSelection } from "./use-host-selection";
import { buildRegionGroupOptions } from "../utils/normalize-catalog";
import { getSelfHostConnectors } from "../providers/registry";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import type {
  HostListViewMode,
  HostSortDirection,
  HostSortField,
} from "../types";
import type { Host } from "@cocalc/conat/hub/api/hosts";

const HOSTS_VIEW_MODE_STORAGE_KEY = "cocalc:hosts:viewMode";
const HOSTS_SORT_FIELD_STORAGE_KEY = "cocalc:hosts:sortField";
const HOSTS_SORT_DIRECTION_STORAGE_KEY = "cocalc:hosts:sortDirection";
const HOSTS_AUTO_RESORT_STORAGE_KEY = "cocalc:hosts:autoResort";
const DEFAULT_HOSTS_VIEW_MODE: HostListViewMode = "grid";
const DEFAULT_SORT_FIELD: HostSortField = "name";
const DEFAULT_SORT_DIRECTION: HostSortDirection = "asc";
const DEFAULT_AUTO_RESORT = false;

function readHostViewMode(): HostListViewMode {
  if (typeof window === "undefined") {
    return DEFAULT_HOSTS_VIEW_MODE;
  }
  const raw = window.localStorage.getItem(HOSTS_VIEW_MODE_STORAGE_KEY);
  if (raw === "grid" || raw === "list") {
    return raw;
  }
  return DEFAULT_HOSTS_VIEW_MODE;
}

function persistHostViewMode(mode: HostListViewMode) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(HOSTS_VIEW_MODE_STORAGE_KEY, mode);
}

function readHostSortField(): HostSortField {
  if (typeof window === "undefined") {
    return DEFAULT_SORT_FIELD;
  }
  const raw = window.localStorage.getItem(HOSTS_SORT_FIELD_STORAGE_KEY);
  if (
    raw === "name" ||
    raw === "provider" ||
    raw === "region" ||
    raw === "size" ||
    raw === "status" ||
    raw === "changed"
  ) {
    return raw;
  }
  return DEFAULT_SORT_FIELD;
}

function persistHostSortField(field: HostSortField) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(HOSTS_SORT_FIELD_STORAGE_KEY, field);
}

function readHostSortDirection(): HostSortDirection {
  if (typeof window === "undefined") {
    return DEFAULT_SORT_DIRECTION;
  }
  const raw = window.localStorage.getItem(
    HOSTS_SORT_DIRECTION_STORAGE_KEY,
  );
  if (raw === "asc" || raw === "desc") {
    return raw;
  }
  if (raw === "ascend") return "asc";
  if (raw === "descend") return "desc";
  return DEFAULT_SORT_DIRECTION;
}

function persistHostSortDirection(direction: HostSortDirection) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(HOSTS_SORT_DIRECTION_STORAGE_KEY, direction);
}

function readHostAutoResort(): boolean {
  if (typeof window === "undefined") {
    return DEFAULT_AUTO_RESORT;
  }
  const raw = window.localStorage.getItem(HOSTS_AUTO_RESORT_STORAGE_KEY);
  if (raw === "true") return true;
  if (raw === "false") return false;
  return DEFAULT_AUTO_RESORT;
}

function persistHostAutoResort(value: boolean) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(
    HOSTS_AUTO_RESORT_STORAGE_KEY,
    value ? "true" : "false",
  );
}

export const useHostsPageViewModel = () => {
  const hub = webapp_client.conat_client.hub;
  const [form] = Form.useForm();
  const isAdmin = !!useTypedRedux("account", "is_admin");
  const flags = useHostFeatureFlags();
  const [showAdmin, setShowAdmin] = React.useState(false);
  const [showDeleted, setShowDeleted] = React.useState(false);

  const { hosts, setHosts, refresh, canCreateHosts } = useHosts(hub, {
    onError: () => message.error("Unable to load hosts"),
    adminView: isAdmin && showAdmin,
    includeDeleted: showDeleted,
  });
  const {
    setStatus,
    removeHost,
    renameHost,
    forceDeprovision,
    removeSelfHostConnector,
  } = useHostActions({
    hub,
    setHosts,
    refresh,
  });
  const upgradeHostSoftware = React.useCallback(
    async (host: Host) => {
      if (!hub.hosts.upgradeHostSoftware) {
        message.error("Host upgrades are not available");
        return;
      }
      try {
        await hub.hosts.upgradeHostSoftware({
          id: host.id,
          targets: [
            { artifact: "project-host", channel: "latest" },
            { artifact: "project", channel: "latest" },
            { artifact: "tools", channel: "latest" },
          ],
        });
        message.success("Upgrade requested");
        await refresh();
      } catch (err) {
        console.error(err);
        message.error("Failed to upgrade host software");
      }
    },
    [hub, refresh],
  );
  const [editingHost, setEditingHost] = React.useState<typeof hosts[number]>();
  const [editOpen, setEditOpen] = React.useState(false);
  const [savingEdit, setSavingEdit] = React.useState(false);
  const { drawerOpen, selected, openDetails, closeDetails } = useHostSelection(hosts);
  const openEdit = (host: typeof hosts[number]) => {
    setEditingHost(host);
    setEditOpen(true);
  };
  const closeEdit = () => {
    setEditOpen(false);
    setEditingHost(undefined);
  };
  const { hostLog, loadingLog } = useHostLog(hub, selected?.id, {
    enabled: drawerOpen,
    limit: 50,
  });
  const [hostViewMode, setHostViewMode] = React.useState<HostListViewMode>(
    readHostViewMode,
  );
  const [sortField, setSortField] =
    React.useState<HostSortField>(readHostSortField);
  const [sortDirection, setSortDirection] =
    React.useState<HostSortDirection>(readHostSortDirection);
  const [autoResort, setAutoResort] =
    React.useState<boolean>(readHostAutoResort);
  React.useEffect(() => {
    persistHostViewMode(hostViewMode);
  }, [hostViewMode]);
  React.useEffect(() => {
    persistHostSortField(sortField);
  }, [sortField]);
  React.useEffect(() => {
    persistHostSortDirection(sortDirection);
  }, [sortDirection]);
  React.useEffect(() => {
    persistHostAutoResort(autoResort);
  }, [autoResort]);

  const {
    providerOptions,
    refreshProviders,
    selectedProvider,
    catalogProvider,
    refreshProvider,
    setRefreshProvider,
  } = useHostProviders({
    form,
    flags,
  });
  const enabledProviders = providerOptions.map((option) => option.value);
  const {
    selectedRegion,
    selectedZone,
    selectedMachineType,
    selectedGpuType,
    selectedGpu,
    selectedSize,
    selectedStorageMode,
  } = useHostFormValues(form);

  const { catalog, catalogError, catalogRefreshing, refreshCatalog } =
    useHostCatalog(hub, {
      provider: catalogProvider,
      refreshProvider,
      onError: (text) => message.error(text),
    });
  const { catalog: selfHostCatalog } = useHostCatalog(hub, {
    provider: "self-host",
    pollMs: 5000,
  });
  const selfHostConnectors = React.useMemo(
    () => getSelfHostConnectors(selfHostCatalog),
    [selfHostCatalog],
  );
  const selfHostConnectorMap = React.useMemo(
    () => new Map(selfHostConnectors.map((connector) => [connector.id, connector])),
    [selfHostConnectors],
  );
  const isSelfHostConnectorOnline = React.useCallback(
    (connectorId?: string) => {
      if (!connectorId) return false;
      const lastSeen = selfHostConnectorMap.get(connectorId)?.last_seen;
      if (!lastSeen) return false;
      const ts = Date.parse(lastSeen);
      if (!Number.isFinite(ts)) return false;
      return Date.now() - ts < 2 * 60 * 1000;
    },
    [selfHostConnectorMap],
  );
  const baseUrl = React.useMemo(() => {
    if (typeof window === "undefined") return "";
    const basePath = appBasePath && appBasePath !== "/" ? appBasePath : "";
    const raw = `${window.location.origin}${basePath}`;
    return raw.replace(/\/$/, "");
  }, []);
  const [setupHost, setSetupHost] = React.useState<Host | undefined>();
  const [setupOpen, setSetupOpen] = React.useState(false);
  const [setupToken, setSetupToken] = React.useState<string | undefined>();
  const [setupExpires, setSetupExpires] = React.useState<string | undefined>();
  const [setupError, setSetupError] = React.useState<string | undefined>();
  const [setupLoading, setSetupLoading] = React.useState(false);
  const setupRequestRef = React.useRef(0);
  const [removeHostTarget, setRemoveHostTarget] = React.useState<Host | undefined>();
  const [removeOpen, setRemoveOpen] = React.useState(false);
  const requestPairingToken = React.useCallback(
    async (host: Host) => {
      if (!baseUrl) throw new Error("missing base url");
      const tokenUrl = `${baseUrl}/self-host/pairing-token`;
      const resp = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ host_id: host.id }),
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(text || "pairing token request failed");
      }
      return (await resp.json()) as {
        pairing_token: string;
        expires?: string;
        connector_id?: string;
      };
    },
    [baseUrl],
  );
  const loadSetupToken = React.useCallback(
    async (host: Host) => {
      const requestId = ++setupRequestRef.current;
      setSetupLoading(true);
      setSetupError(undefined);
      try {
        const data = await requestPairingToken(host);
        if (setupRequestRef.current !== requestId) return;
        setSetupToken(data.pairing_token);
        setSetupExpires(data.expires);
      } catch (err) {
        if (setupRequestRef.current !== requestId) return;
        console.error(err);
        setSetupError(
          err instanceof Error && err.message
            ? err.message
            : "Failed to create pairing token",
        );
      } finally {
        if (setupRequestRef.current === requestId) {
          setSetupLoading(false);
        }
      }
    },
    [requestPairingToken],
  );
  const openSetup = React.useCallback(
    (host: Host) => {
      setSetupHost(host);
      setSetupOpen(true);
      setSetupToken(undefined);
      setSetupExpires(undefined);
      setSetupError(undefined);
      void loadSetupToken(host);
    },
    [loadSetupToken],
  );
  const closeSetup = React.useCallback(() => {
    setSetupOpen(false);
    setSetupHost(undefined);
    setSetupToken(undefined);
    setSetupExpires(undefined);
    setSetupError(undefined);
  }, []);
  const openRemove = React.useCallback((host: Host) => {
    setRemoveHostTarget(host);
    setRemoveOpen(true);
  }, []);
  const closeRemove = React.useCallback(() => {
    setRemoveOpen(false);
    setRemoveHostTarget(undefined);
  }, []);
  const refreshSetup = React.useCallback(() => {
    if (!setupHost) return;
    void loadSetupToken(setupHost);
  }, [loadSetupToken, setupHost]);

  const {
    fieldSchema,
    fieldOptions,
    fieldLabels,
    fieldTooltips,
    supportsPersistentStorage,
    persistentGrowable,
    storageModeOptions,
    showDiskFields,
    catalogSummary,
    applyRecommendation,
  } = useHostForm({
    form,
    catalog,
    selectedProvider,
    selectedRegion,
    selectedZone,
    selectedMachineType,
    selectedGpuType,
    selectedGpu,
    selectedSize,
    selectedStorageMode,
    enabledProviders,
  });
  const regionOptions = buildRegionGroupOptions(catalogSummary);

  const {
    aiPrompt,
    setAiPrompt,
    aiBudget,
    setAiBudget,
    aiRegionGroup,
    setAiRegionGroup,
    aiLoading,
    aiError,
    aiResults,
    runAiRecommendation,
  } = useHostAi({
    catalogSummary,
    availableProviders: enabledProviders,
    regionOptions,
  });

  const { creating, onCreate } = useHostCreate({
    hub,
    refresh,
    fieldOptions,
    catalog,
  });

  const createVm = useHostCreateViewModel({
    permissions: { isAdmin, canCreateHosts },
    form: { form, creating, onCreate },
    provider: {
      providerOptions,
      selectedProvider: selectedProvider ?? providerOptions[0]?.value ?? "none",
      fields: {
        schema: fieldSchema,
        options: fieldOptions,
        labels: fieldLabels,
        tooltips: fieldTooltips,
      },
      storage: {
        storageModeOptions,
        supportsPersistentStorage,
        persistentGrowable,
        showDiskFields,
      },
      catalogError,
    },
    catalogRefresh: {
      refreshProviders,
      refreshProvider,
      setRefreshProvider,
      refreshCatalog,
      catalogRefreshing,
    },
    ai: {
      aiQuestion: aiPrompt,
      setAiQuestion: setAiPrompt,
      aiBudget,
      setAiBudget,
      aiRegionGroup,
      setAiRegionGroup,
      aiLoading,
      aiError,
      aiResults,
      canRecommend: !!catalogSummary,
      runAiRecommendation,
      applyRecommendation,
      regionOptions,
    },
  });
  const hostListVm = useHostListViewModel({
    hosts,
    onStart: (id: string) => setStatus(id, "start"),
    onStop: (id: string) => setStatus(id, "stop"),
    onDelete: removeHost,
    onDetails: openDetails,
    onEdit: openEdit,
    selfHost: {
      connectorMap: selfHostConnectorMap,
      isConnectorOnline: isSelfHostConnectorOnline,
      onSetup: openSetup,
    },
    viewMode: hostViewMode,
    setViewMode: setHostViewMode,
    isAdmin,
    showAdmin,
    setShowAdmin,
    showDeleted,
    setShowDeleted,
    sortField,
    setSortField,
    sortDirection,
    setSortDirection,
    autoResort,
    setAutoResort,
  });
  const hostDrawerVm = useHostDrawerViewModel({
    open: drawerOpen,
    host: selected,
    onClose: closeDetails,
    onEdit: openEdit,
    onUpgrade: isAdmin ? upgradeHostSoftware : undefined,
    canUpgrade: isAdmin,
    hostLog,
    loadingLog,
    selfHost: {
      connectorMap: selfHostConnectorMap,
      isConnectorOnline: isSelfHostConnectorOnline,
      onSetup: openSetup,
      onRemove: openRemove,
      onForceDeprovision: (host: Host) => forceDeprovision(host.id),
    },
  });

  const editVm = {
    open: editOpen,
    host: editingHost,
    saving: savingEdit,
    onCancel: closeEdit,
    onSave: async (id: string, name: string) => {
      setSavingEdit(true);
      await renameHost(id, name);
      setSavingEdit(false);
      closeEdit();
    },
  };

  const setupVm = {
    open: setupOpen,
    host: setupHost,
    loading: setupLoading,
    error: setupError,
    token: setupToken,
    expires: setupExpires,
    baseUrl,
    connector:
      setupHost && setupHost.region
        ? selfHostConnectorMap.get(setupHost.region)
        : undefined,
    onCancel: closeSetup,
    onRefresh: refreshSetup,
  };

  const removeVm = {
    open: removeOpen,
    host: removeHostTarget,
    onCancel: closeRemove,
    onRemove: async () => {
      if (!removeHostTarget) return;
      await removeSelfHostConnector(removeHostTarget.id);
      closeRemove();
    },
  };

  return { createVm, hostListVm, hostDrawerVm, editVm, setupVm, removeVm };
};
