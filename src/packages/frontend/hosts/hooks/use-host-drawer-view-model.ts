import type { Host } from "@cocalc/conat/hub/api/hosts";
import type { HostLogEntry } from "./use-host-log";
import type { HostLroState } from "./use-host-ops";

type UseHostDrawerViewModelArgs = {
  open: boolean;
  host: Host | undefined;
  hostOps?: Record<string, HostLroState>;
  onClose: () => void;
  onEdit: (host: Host) => void;
  onUpgrade?: (host: Host) => void;
  canUpgrade?: boolean;
  hostLog: HostLogEntry[];
  loadingLog: boolean;
  selfHost?: {
    connectorMap: Map<string, { id: string; name?: string; last_seen?: string }>;
    isConnectorOnline: (connectorId?: string) => boolean;
    onSetup: (host: Host) => void;
    onRemove: (host: Host) => void;
    onForceDeprovision: (host: Host) => void;
  };
};

export const useHostDrawerViewModel = ({
  open,
  host,
  hostOps,
  onClose,
  onEdit,
  onUpgrade,
  canUpgrade,
  hostLog,
  loadingLog,
  selfHost,
}: UseHostDrawerViewModelArgs) => {
  return {
    open,
    host,
    hostOps,
    onClose,
    onEdit,
    onUpgrade,
    canUpgrade,
    hostLog,
    loadingLog,
    selfHost,
  };
};
