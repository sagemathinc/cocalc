import { useEffect, useMemo, useRef, useState } from "react";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import useCounter from "@cocalc/frontend/app-framework/counter-hook";
import { cmp_Date } from "@cocalc/util/cmp";
import { client_db } from "@cocalc/util/db-schema";

interface Options {
  query: object; // assumed to have one key exactly, which is name of table
  changes?: boolean; // if true, automatically updates records loaded during first query.  Doesn't add/remove anything yet though.
}

export function useTable({ query, changes = false }: Options): {
  data: any[];
  refresh: () => void;
  editableContext: { counter: number; table: string };
  error?: string;
} {
  const info = useMemo(() => {
    const table = Object.keys(query)[0];
    const primary_key = client_db.primary_keys(table)[0]; // assume only one
    return { table, primary_key };
  }, []);

  const [data, setData] = useState<any[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);
  const { val: disconnectCounter, inc: incDisconnectCounter } = useCounter();
  const refreshRef = useRef<(x?) => Promise<void>>(async () => {});
  const { val: counter, inc: incCounter } = useCounter();
  useEffect(() => {
    incCounter();
  }, [data]);

  refreshRef.current = async (x) => {
    // specific record changed
    for (let i = 0; i < data.length; i++) {
      if (data[i][info.primary_key] == x[info.primary_key]) {
        data[i] = { ...data[i], ...x };
        setData([...data]);
        return;
      }
    }
  };

  useEffect(() => {
    const x = { id: "" };
    // console.log("connecting...", disconnectCounter);
    webapp_client.query_client.query({
      changes,
      query,
      cb: (err, resp) => {
        if (err == "disconnect") {
          incDisconnectCounter();
          return;
        }
        if (err) {
          // TODO: set some overall error state.
          console.warn(err);
          setError(`${err}`);
          return;
        }
        if (error) {
          setError("");
        }
        // TODO: err handling, reconnect logic
        if (resp.action) {
          // change, e.g., insert or update or delete
          refreshRef.current(resp.new_val);
        } else {
          // initial response
          x.id = resp.id;
          for (const table in resp.query) {
            resp.query[table].sort(
              // TODO: might not be what we want?
              (a, b) => -cmp_Date(a.last_edited, b.last_edited)
            );
            setData(resp.query[table]);
            break;
          }
        }
      },
    });
    return () => {
      // clean up by cancelling the changefeed when
      // component unmounts
      if (x.id) {
        (async () => {
          try {
            await webapp_client.query_client.cancel(x.id);
          } catch (_err) {
            // many valid reasons to get error here.
          }
        })();
      }
    };
  }, [disconnectCounter]);

  const editableContext = { counter, table: info.table };
  return { data, refresh: incDisconnectCounter, editableContext, error };
}
