import type { Host } from "@cocalc/conat/hub/api/hosts";

type UseHostListViewModelArgs = {
  hosts: Host[];
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onDelete: (id: string) => void;
  onDetails: (host: Host) => void;
  onEdit: (host: Host) => void;
};

export const useHostListViewModel = ({
  hosts,
  onStart,
  onStop,
  onDelete,
  onDetails,
  onEdit,
}: UseHostListViewModelArgs) => {
  return {
    hosts,
    onStart,
    onStop,
    onDelete,
    onDetails,
    onEdit,
  };
};
