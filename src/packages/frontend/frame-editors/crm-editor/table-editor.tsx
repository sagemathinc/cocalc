/*
The overall editor frame component.

This mainly sets up a bunch of context that's used by the implementation and
currently displays tabs for each table.
*/

import { SyncdbContext } from "@cocalc/frontend/app-framework/syncdb";
import { TagsProvider } from "./querydb/tags";
import { AgentsProvider } from "./querydb/use-agents";
import { QueryCache } from "./querydb/use-query-cache";
import TableTabs from "./views/table-tabs";
import "./ant-hacks.css";

export default function TableEditor({ actions }) {
  return (
    <div style={{ height: "100%", overflow: "auto" }}>
      <SyncdbContext.Provider value={{ syncdb: actions._syncstring }}>
        <TagsProvider>
          <AgentsProvider>
            <QueryCache>
              <TableTabs />
            </QueryCache>
          </AgentsProvider>
        </TagsProvider>
      </SyncdbContext.Provider>
    </div>
  );
}
