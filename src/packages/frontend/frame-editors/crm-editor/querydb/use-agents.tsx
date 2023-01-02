import { createContext, useContext, useEffect, useMemo } from "react";
import { useTable } from "./use-table";

interface Agent {
  account_id: string; // uuid
  first_name: string;
  last_name: string;
}

type AgentsMap = { [account_id: string]: Agent };
export interface AgentsContextType {
  agentsArray: null | Agent[];
  agentsMap: null | AgentsMap;
  refresh: () => void;
}

export const AgentsContext = createContext<AgentsContextType>({
  agentsArray: null,
  agentsMap: null,
  refresh: () => {}, // refreshes the query; safe to call frequently when this is being used.
});

export function AgentsProvider({ children }) {
  const {
    data: agentsArray,
    editableContext,
    refresh,
  } = useTable({
    query: {
      crm_agents: [{ account_id: null, first_name: null, last_name: null }],
    },
    // NOTE: changefeeds are NOT supported for the agents table since it's
    // a weird 'admin'=ANY(...) query.  Instead clients periodically refresh
    // the query when it's being actively used somehow.
    changes: false,
    debounceWaitMs: 10000,
  });

  const agentsMap = useMemo(() => {
    // some tags have changed, so update our tags map
    const agentsMap: AgentsMap = {};
    for (const x of agentsArray) {
      agentsMap[x.account_id] = x;
    }
    return agentsMap;
  }, [agentsArray, editableContext.counter]);

  return (
    <AgentsContext.Provider value={{ agentsArray, agentsMap, refresh }}>
      {children}
    </AgentsContext.Provider>
  );
}

export default function useAgents(): AgentsContextType {
  const context = useContext(AgentsContext);
  // always do one refresh whenever hook is first mounted...
  // we may change this later to update or something else.  I don't know.
  // We debounced the refresh to 10s above so this should be very safe.
  useEffect(() => {
    context.refresh();
  }, []);
  return context;
}
