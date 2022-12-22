import { useEffect, useMemo, useState } from "react";
import { useSyncdbContext } from "@cocalc/frontend/app-framework/syncdb";
import { uuid } from "@cocalc/util/misc";
import { field_cmp } from "@cocalc/util/cmp";
import type { SetOptional } from "type-fest";
import { fieldToLabel } from "../util";
import type { ViewType } from "../types";

export interface View {
  table: "views";
  id: string;
  type: ViewType;
  name: string;
  dbtable: string;
  pos: number;
  filter?: string;
}

type PartialView = SetOptional<View, "table" | "id" | "dbtable" | "name">;

type SetViewFunction = (PartialView) => void;
type DeleteViewFunction = (View) => void;

type Views = View[];

export default function useViews(dbtable: string): {
  views: Views | null;
  saveView: SetViewFunction;
  deleteView: DeleteViewFunction;
} {
  const { syncdb } = useSyncdbContext();
  const [views, saveViews] = useState<Views | null>(null);

  useEffect(() => {
    if (syncdb == null) {
      saveViews(null);
      return;
    }

    function update() {
      if (syncdb == null) return; // typescript
      const array = syncdb
        .get({ table: "views" })
        .filter((x) => x.get("dbtable") == dbtable)
        .toJS();
      array.sort(field_cmp("pos"));
      saveViews(array);
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

  const saveView = useMemo(() => {
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
        if (views != null) {
          views.push(view as View);
        }
      }
      if (view.pos == null) {
        // assign new position
        view.pos =
          Math.max(
            0,
            ...syncdb
              .get({ table: "views" })
              .filter((x) => x.get("dbtable") == dbtable)
              .map((x) => x.get("pos"))
          ) + 1;
      }

      if (views != null) {
        // ensure change is reflected immediately, rather than going through syncdb.
        views.sort(field_cmp("pos"));
        saveViews([...views]);
      }

      syncdb.set(view);
      syncdb.commit();
    };
  }, [syncdb, dbtable, views]);

  const deleteView = useMemo(() => {
    if (syncdb == null)
      return (_view: View) => {
        throw Error("syncdb not yet defined, so can't set view.");
      };
    return ({ table, id }) => {
      syncdb.delete({ table, id });
      syncdb.commit();
    };
  }, [syncdb]);

  return { views, saveView, deleteView };
}
