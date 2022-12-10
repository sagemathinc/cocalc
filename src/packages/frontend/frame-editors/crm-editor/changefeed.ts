import { useEffect, useState, useRef } from "react";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import useCounter from "@cocalc/frontend/app-framework/counter-hook";

interface Options {
  query: object; // assumed to have one key exactly, which is name of table
}

export function useTable({ query }: Options) {
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
      changes: true,
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

  const context = { counter, table: Object.keys(query) };
  return [data, incDisconnectCounter, context];
}
