import { useEffect, useMemo, useRef, useState } from "react";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import useCounter from "@cocalc/frontend/app-framework/counter-hook";
import useDebounceEffect from "@cocalc/frontend/app-framework/use-debounce-effect";
import { client_db } from "@cocalc/util/db-schema";
import type { EditableContextType } from "../fields/context";
import { pick } from "lodash";
import { AtomicSearch } from "../syncdb/use-search";
import querydbSet from "./set";
import { DEFAULT_LIMIT } from "../views/view";
import useIsMountedRef from "@cocalc/frontend/app-framework/is-mounted-hook";

interface Options {
  query: object; // assumed to have one key exactly, which is name of table
  changes?: boolean; // if true, automatically updates records loaded during first query.  Doesn't add/remove anything yet though.
  sortFields?: string[];
  hiddenFields?: Set<string>;
  search?: AtomicSearch[];
  limit?: number;
  debounceWaitMs?: number;
}

export function useTable({
  query,
  changes = false,
  sortFields,
  hiddenFields,
  search,
  limit,
  debounceWaitMs = 1000,
}: Options): {
  data: any[];
  refresh: () => void;
  editableContext: EditableContextType;
  error?: string;
  loading: boolean;
  saving: boolean;
} {
  const isMountedRef = useIsMountedRef();
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const lastSaveRef = useRef<number>(0);

  const info = useMemo(() => {
    const table = Object.keys(query)[0];
    const primary_keys = client_db.primary_keys(table);
    const save = async (obj: object, changed: object) => {
      const query = {
        [table]: {
          ...pick(obj, primary_keys),
          ...changed,
        },
      };

      lastSaveRef.current = Date.now();
      try {
        setSaving(true);
        setError("");
        await querydbSet(query);
      } catch (err) {
        if (isMountedRef.current) {
          setError(`${err}`);
        }
      } finally {
        if (isMountedRef.current) {
          setSaving(false);
        }
      }
    };

    return { table, primary_keys, save };
  }, [query]);

  const [data, setData] = useState<any[]>([]);
  const { val: disconnectCounter, inc: incDisconnectCounter } = useCounter();
  const refreshRef = useRef<(x?) => Promise<void>>(async () => {});
  const { val: counter, inc: incCounter } = useCounter();
  useEffect(() => {
    if (Date.now() - lastSaveRef.current < 1000) {
      // we don't increment the counter immediately after saving... since often the save
      // changes this which undoes setting to null in the UI.
      return;
    }
    incCounter();
  }, [data]);

  refreshRef.current = async ({ old_val, new_val }) => {
    // console.log("changefeed", { old_val, new_val });
    // specific record changed, created or deleted
    if (new_val != null) {
      for (let i = 0; i < data.length; i++) {
        let matches = true;
        for (const primary_key of info.primary_keys) {
          if (data[i]?.[primary_key] != new_val[primary_key]) {
            matches = false;
            break;
          }
        }
        if (matches) {
          data[i] = { ...data[i], ...new_val };
          setData([...data]);
          return;
        }
      }
      // no match -- new value created
      data.push(new_val);
      setData([...data]);
    } else if (old_val != null) {
      // delete
      for (let i = 0; i < data.length; i++) {
        let matches = true;
        for (const primary_key of info.primary_keys) {
          if (data[i]?.[primary_key] != old_val[primary_key]) {
            matches = false;
            break;
          }
        }
        if (matches) {
          data.splice(i, 1);
          setData([...data]);
          return;
        }
      }
      // no match -- don't need to do anything
    }
  };

  useDebounceEffect<
    [number, string[]?, Set<string>?, number?, AtomicSearch[]?]
  >(
    {
      wait: debounceWaitMs,
      options: { leading: true, trailing: true },
      func: ([_, sortFields, hiddenFields, limit, search]) => {
        const x = { id: "" };
        const q = getQuery(query, hiddenFields, search);
        const options = ([{ limit: limit ?? DEFAULT_LIMIT }] as any[]).concat(
          sortOptions(sortFields),
        );
        setLoading(true);
        webapp_client.query_client.query({
          changes,
          query: q,
          options,
          cb: (err, resp) => {
            setLoading(false);
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
            // successfully query so clear error state
            setError("");
            // TODO: err handling, reconnect logic
            if (resp.action) {
              // change, e.g., insert or update or delete
              refreshRef.current(resp);
            } else {
              // initial response
              x.id = resp.id;
              for (const table in resp.query) {
                // exactly one thing in for loop:
                setData(resp.query[table]);
                break;
              }
            }
          },
        });
        return () => {
          // clean up by canceling the changefeed when
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
      },
    },
    [disconnectCounter, sortFields, hiddenFields, limit, search],
  );

  const refresh = incDisconnectCounter;
  const editableContext = {
    counter,
    refresh,
    ...info,
  };
  return { data, refresh, editableContext, error, saving, loading };
}

function sortOptions(sortFields?: string[]) {
  if (sortFields == null || sortFields.length == 0) {
    return [];
  }
  return sortFields.map((field) => {
    return { order_by: field };
  });
}

function getQuery(query, hiddenFields?: Set<string>, search?: AtomicSearch[]) {
  if (
    (hiddenFields == null || hiddenFields.size == 0) &&
    (search == null || search.length == 0)
  ) {
    return query;
  }
  const table = Object.keys(query)[0];
  const primary_keys = client_db.primary_keys(table);
  const fields = { ...query[table][0] };
  if (hiddenFields != null) {
    for (const field of hiddenFields) {
      if (!primary_keys.includes(field)) {
        delete fields[field];
      }
    }
  }
  if (search != null) {
    for (const { field, operator, value } of search) {
      if (field == null || operator == null || value === undefined) {
        // not fully entered by user yet, so ignore
        continue;
      }
      fields[field] = { [operator]: value };
    }
  }
  return { [table]: [fields] };
}
