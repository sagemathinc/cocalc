import { useEffect, useMemo, useState } from "react";
import { useSyncdbContext } from "./context";
import { uuid } from "@cocalc/util/misc";
import type { SetOptional } from "type-fest";
import { fieldToLabel } from "../util";

interface View {
  table: "views";
  id: string;
  type: string;
  name: string;
  dbtable: string;
}

type SetViewFunction = (View) => void;

export default function useViews(
  dbtable: string
): [View[] | null, SetViewFunction] {
  const { syncdb } = useSyncdbContext();
  const [views, setViews] = useState<View[] | null>(null);

  useEffect(() => {
    if (syncdb == null) {
      setViews([]);
      return;
    }

    function update() {
      if (syncdb == null) return; // typescript
      const v = syncdb
        .get({ table: "views" })
        .filter((x) => x.get("dbtable") == dbtable)
        .toJS();
      setViews(v);
    }

    function handleChange(keys) {
      // pretty dumb for now -- if any view changes, we just reread them all.
      // not even sure this is a good design, so don't worry about speed yet.  Plus for up to 100 views this
      // would be fine, since they rarely change.
      let changed = false;
      for (const key of keys) {
        if (key.get("table") == "views") {
          changed = true;
          break;
        }
      }
      if (changed) {
        update();
      }
    }
    syncdb.on("change", handleChange);
    if (syncdb.get_state() == "ready") {
      update();
    }

    return () => {
      syncdb.removeListener("change", handleChange);
    };
  }, [syncdb, dbtable]);

  const setView = useMemo(() => {
    if (syncdb == null)
      return (_view: View) => {
        throw Error("syncdb not yet defined, so can't set view.");
      };
    return (view: SetOptional<View, "table" | "id" | "dbtable" | "name">) => {
      view.table = "views";
      view.dbtable = dbtable;
      if (!view.name) {
        view.name = fieldToLabel(view.type ?? dbtable);
      }
      if (view.id == null) {
        // caller assumes view is mutated.
        // assign a new id
        while (true) {
          view.id = uuid().slice(0, 8);
          if (syncdb.get_one({ table: "views", id: view.id }) == null) {
            break;
          }
        }
      }
      syncdb.set(view);
      syncdb.commit();
    };
  }, [syncdb, dbtable]);

  return [views, setView];
}
