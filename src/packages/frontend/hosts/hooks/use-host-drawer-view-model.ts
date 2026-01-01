import type { Host } from "@cocalc/conat/hub/api/hosts";
import type { HostLogEntry } from "./use-host-log";

type UseHostDrawerViewModelArgs = {
  open: boolean;
  host: Host | undefined;
  onClose: () => void;
  onEdit: (host: Host) => void;
  hostLog: HostLogEntry[];
  loadingLog: boolean;
};

export const useHostDrawerViewModel = ({
  open,
  host,
  onClose,
  onEdit,
  hostLog,
  loadingLog,
}: UseHostDrawerViewModelArgs) => {
  return {
    open,
    host,
    onClose,
    onEdit,
    hostLog,
    loadingLog,
  };
};
