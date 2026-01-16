import type { Host } from "@cocalc/conat/hub/api/hosts";
import type {
  HostListViewMode,
  HostSortDirection,
  HostSortField,
  HostStopOptions,
  HostDeleteOptions,
} from "../types";
import type { HostCatalog } from "@cocalc/conat/hub/api/hosts";
import type { HostLroState } from "./use-host-ops";

type UseHostListViewModelArgs = {
  hosts: Host[];
  hostOps?: Record<string, HostLroState>;
  onStart: (id: string) => void;
  onStop: (id: string, opts?: HostStopOptions) => void;
  onRestart: (id: string, mode: "reboot" | "hard") => void;
  onDelete: (id: string, opts?: HostDeleteOptions) => void;
  onCancelOp?: (op_id: string) => void;
  onUpgrade?: (host: Host) => void;
  onDetails: (host: Host) => void;
  onEdit: (host: Host) => void;
  selfHost?: {
    connectorMap: Map<string, { id: string; name?: string; last_seen?: string }>;
    isConnectorOnline: (connectorId?: string) => boolean;
    onSetup: (host: Host) => void;
  };
  viewMode: HostListViewMode;
  setViewMode: (mode: HostListViewMode) => void;
  isAdmin: boolean;
  showAdmin: boolean;
  setShowAdmin: (value: boolean) => void;
  showDeleted: boolean;
  setShowDeleted: (value: boolean) => void;
  sortField: HostSortField;
  setSortField: (value: HostSortField) => void;
  sortDirection: HostSortDirection;
  setSortDirection: (value: HostSortDirection) => void;
  autoResort: boolean;
  setAutoResort: (value: boolean) => void;
  providerCapabilities?: HostCatalog["provider_capabilities"];
};

export const useHostListViewModel = ({
  hosts,
  hostOps,
  onStart,
  onStop,
  onRestart,
  onDelete,
  onCancelOp,
  onUpgrade,
  onDetails,
  onEdit,
  selfHost,
  viewMode,
  setViewMode,
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
  providerCapabilities,
}: UseHostListViewModelArgs) => {
  return {
    hosts,
    hostOps,
    onStart,
    onStop,
    onRestart,
    onDelete,
    onCancelOp,
    onUpgrade,
    onDetails,
    onEdit,
    selfHost,
    viewMode,
    setViewMode,
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
    providerCapabilities,
  };
};
