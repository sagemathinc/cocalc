import { useEffect, useState } from "@cocalc/frontend/app-framework";
import type { Host } from "@cocalc/conat/hub/api/hosts";

export const useHostSelection = (hosts: Host[]) => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<Host | undefined>(undefined);

  useEffect(() => {
    if (!selected) return;
    const updated = hosts.find((h) => h.id === selected.id);
    setSelected(updated);
  }, [hosts, selected?.id]);

  const openDetails = (host: Host) => {
    setSelected(host);
    setDrawerOpen(true);
  };

  const closeDetails = () => setDrawerOpen(false);

  return {
    drawerOpen,
    setDrawerOpen,
    selected,
    setSelected,
    openDetails,
    closeDetails,
  };
};
