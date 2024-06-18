import { useEffect, useState } from "react";
import { getMetrics } from "./api";

export default function Metrics({ id }) {
  const [metrics, setMetrics] = useState<any>([]);
  useEffect(() => {
    console.log({ setMetrics, getMetrics, id });
    //     (async () => {
    //       setMetrics(await getMetrics({ id }));
    //     })();
  }, []);

  return <pre>{JSON.stringify(metrics, undefined, 2)}</pre>;
}
