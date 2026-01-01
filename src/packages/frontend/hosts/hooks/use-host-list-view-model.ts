import type { Host } from "@cocalc/conat/hub/api/hosts";
import type { HostListViewMode } from "../types";

type UseHostListViewModelArgs = {
  hosts: Host[];
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onDelete: (id: string) => void;
  onDetails: (host: Host) => void;
  onEdit: (host: Host) => void;
  viewMode: HostListViewMode;
  setViewMode: (mode: HostListViewMode) => void;
};

export const useHostListViewModel = ({
  hosts,
  onStart,
  onStop,
  onDelete,
  onDetails,
  onEdit,
  viewMode,
  setViewMode,
}: UseHostListViewModelArgs) => {
  return {
    hosts,
    onStart,
    onStop,
    onDelete,
    onDetails,
    onEdit,
    viewMode,
    setViewMode,
  };
};
