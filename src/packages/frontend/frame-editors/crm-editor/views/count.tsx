/* Display approximate count of entries in a database table. */

import { useState } from "react";
import { useAsyncEffect } from "use-async-effect";
import { Alert } from "antd";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { Loading } from "@cocalc/frontend/components/loading";
import { SCHEMA } from "@cocalc/util/db-schema";

interface Props {
  dbtable: string;
  lowerBound?: number;
}

export default function Count({ dbtable, lowerBound }: Props) {
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState<string>("");

  useAsyncEffect(
    async (isMounted) => {
      let result;
      const schema = SCHEMA[dbtable];
      try {
        result = await webapp_client.async_query({
          query: {
            pg_class: { reltuples: null, relname: schema.virtual ?? dbtable },
          },
        });
      } catch (err) {
        if (isMounted()) {
          setError(`${err}`);
        }
        return;
      }
      if (isMounted()) {
        setCount(Math.max(lowerBound ?? 0, result.query.pg_class.reltuples));
      }
    },
    [dbtable, lowerBound]
  );

  return (
    <div>
      {error && <Alert type="error" message={error} />}
      {!error && count != null && (
        <Stat title={"Table size"} value={<>Approx {count}</>} />
      )}
      {!error && count == null && <Loading />}
    </div>
  );
}

export function Stat({ title, value }) {
  return (
    <div style={{ display: "flex" }}>
      <div style={{ fontWeight: 450, flex: 1 }}>{title}</div>
      <div style={{ fontWeight: 250, marginLeft: "10px" }}>{value}</div>
    </div>
  );
}
