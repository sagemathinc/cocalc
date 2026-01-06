import type { Host } from "@cocalc/conat/hub/api/hosts";
import type { HostLogEntry } from "./use-host-log";

type UseHostDrawerViewModelArgs = {
  open: boolean;
  host: Host | undefined;
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
  };
};

export const useHostDrawerViewModel = ({
  open,
  host,
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
    onClose,
    onEdit,
    onUpgrade,
    canUpgrade,
    hostLog,
    loadingLog,
    selfHost,
  };
};
