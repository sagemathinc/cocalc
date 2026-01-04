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
  };
};
