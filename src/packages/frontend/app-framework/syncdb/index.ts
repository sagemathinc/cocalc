/*
Hooks and Context for working with a SyncDB object with react.

This is fairly self contained.

<SyncdbContext syncdb={...}>
   react tree that uses the other hooks
</<SyncdbContext>


- useSyncdbContext: easy access to the syncdb
    const { syncdb } = useSyncdbContext();

- useSyncdbRecord: access to a particular object in the syncdb defined by
  a primary key.  You can get and set it like using setValue with immediate
  updates; it gets commited to the sync database with debouncing and remote
  changes update it.

    [record, setRecord] = useSyncdbRecord<TypeOfRecord>({key:..., defaultValue:..., debounceMs:...})

*/

import useSyncdbRecord from "./use-syncdb-record";
export { useSyncdbRecord };

export { useSyncdbContext, SyncdbContext } from "./syncdb-context";
