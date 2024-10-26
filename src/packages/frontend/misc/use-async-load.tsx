import { useEffect, useState } from "react";
import { Spin } from "antd";

function useAsyncLoad(f: () => Promise<void>) {
  const [loading, setLoading] = useState<boolean>(false);
  const [counter, setCounter] = useState<number>(0);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        setError("");
        setLoading(true);
        await f();
      } catch (err) {
        setError(`${err}`);
      } finally {
        setLoading(false);
      }
    })();
  }, [counter]);
  const component = (
    <div>
      {loading && <Spin />}
      <ShowError
        error={error}
        setError={setError}
        style={{ margin: "15px auto" }}
        F
      />
    </div>
  );

  return {
    loading,
    refresh: () => setCounter(counter + 1),
    error,
    setError,
    component,
  };
}
