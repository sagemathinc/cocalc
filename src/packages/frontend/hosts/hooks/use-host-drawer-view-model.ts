import type { Host } from "@cocalc/conat/hub/api/hosts";
import type { HostLogEntry } from "./use-host-log";

type UseHostDrawerViewModelArgs = {
  open: boolean;
  host: Host | undefined;
  onClose: () => void;
  hostLog: HostLogEntry[];
  loadingLog: boolean;
};

export const useHostDrawerViewModel = ({
  open,
  host,
  onClose,
  hostLog,
  loadingLog,
}: UseHostDrawerViewModelArgs) => {
  return {
    open,
    host,
    onClose,
    hostLog,
    loadingLog,
  };
};
