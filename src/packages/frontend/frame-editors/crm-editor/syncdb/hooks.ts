import { useEffect } from "react";

import { useSyncdbContext } from "./context";

interface View {
  id: number;
  type: string;
  name: string;
}

export function useViews(): { views: View[] | null; create; set } {
  const { syncdb } = useSyncdbContext();

  useEffect(() => {
    syncdb.on
    
  }, []);
}
