import { createContext, useContext, useMemo } from "react";
import { useTable } from "./use-table";
import { getTableDescription } from "../tables";

interface Agent {
  account_id: number;
  name: string;
  email_address?: string;
}

type AgentsMap = { [account_id: string]: Agent };
export interface AgentsContextType {
  agentsArray: null | Agent[];
  agentsMap: null | AgentsMap;
}

export const AgentsContext = createContext<AgentsContextType>({
  agentsArray: null,
  agentsMap: null,
});

export function AgentsProvider({ children }) {
  const { query } = useMemo(() => getTableDescription("agents"), []);
  const { data: agentsArray, editableContext } = useTable({
    query,
    changes: true,
  });

  const agentsMap = useMemo(() => {
    // some tags have changed, so update our tags map
    const agentsMap: AgentsMap = {};
    for (const x of agentsArray) {
      agentsMap[x.id] = x;
    }
    return agentsMap;
  }, [agentsArray, editableContext.counter]);

  return (
    <AgentsContext.Provider value={{ agentsArray, agentsMap }}>
      {children}
    </AgentsContext.Provider>
  );
}

export default function useAgents() {
  return useContext(AgentsContext);
}
