import { useEffect, useState, useRef } from "react";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import useCounter from "@cocalc/frontend/app-framework/counter-hook";
import { cmp_Date } from "@cocalc/util/cmp";

interface Options {
  query: object; // assumed to have one key exactly, which is name of table
  changes?: boolean; // if true, automatically updates records loaded during first query.  Doesn't add/remove anything yet though.
}

export function useTable({
  query,
  changes = false,
}: Options): [any[], () => void, { counter: number; table: string }] {
  const [data, setData] = useState<any[]>([]);
  const { val: disconnectCounter, inc: incDisconnectCounter } = useCounter();
  const refreshRef = useRef<(x?) => Promise<void>>(async () => {});
  const { val: counter, inc: incCounter } = useCounter();
  useEffect(() => {
    incCounter();
  }, [data]);

  refreshRef.current = async (x) => {
    // specific record changed
    for (let i = 0; i < data.length; i++) {
      if (data[i].id == x.id) {
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
          return;
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

  const context = { counter, table: Object.keys(query)[0] };
  return [data, incDisconnectCounter, context];
}
