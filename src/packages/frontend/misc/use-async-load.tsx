/*
Finally do this once and for all... a hook that does:

- async load of some data by calling an async function
- loading spin indicator
- error indicator
- ability to clear error
- refresh button and refresh function to call to call it again
- always reuseInFlight the async function
- optionally throttling or debouncing async function.
*/

import { useEffect, useMemo, useState } from "react";
import { Button, Spin } from "antd";
import ShowError from "@cocalc/frontend/components/error";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { debounce, throttle } from "lodash";
import { Icon } from "@cocalc/frontend/components/icon";

interface Options<T> {
  f?: () => Promise<T>;
  debounceWait?: number;
  debounceOptions?;
  throttleWait?: number;
  throttleOptions?;
  refreshStyle?;
}

export default function useAsyncLoad<T>({
  f,
  debounceWait,
  debounceOptions,
  throttleWait,
  throttleOptions,
  refreshStyle,
}: Options<T>) {
  const [loading, setLoading] = useState<boolean>(false);
  const [counter, setCounter] = useState<number>(0);
  const [error, setError] = useState<string>("");
  const [result, setResult] = useState<T | null>(null);

  const callF = useMemo(() => {
    if (f == null) {
      // no-op for now
      return () => {};
    }
    const g = reuseInFlight(async () => {
      try {
        setError("");
        setLoading(true);
        setResult(await f());
      } catch (err) {
        setError(`${err}`);
      } finally {
        setLoading(false);
      }
    });
    if (throttleWait) {
      return throttle(g, throttleWait, throttleOptions);
    }
    if (debounceWait) {
      return debounce(g, debounceWait, debounceOptions);
    }
    return g;
  }, [debounceWait, debounceOptions, throttleWait, throttleOptions, f]);

  useEffect(() => {
    callF();
  }, [counter, f]);

  const refresh = () => setCounter(counter + 1);

  const component = (
    <div>
      {loading && <Spin />}
      {!loading && (
        <Button style={refreshStyle} onClick={refresh} type="text">
          <Icon name="refresh" /> Refresh
        </Button>
      )}
      <ShowError
        error={error}
        setError={setError}
        style={{ margin: "15px auto" }}
      />
    </div>
  );

  return {
    loading,
    refresh,
    error,
    setError,
    component,
    result,
  };
}
