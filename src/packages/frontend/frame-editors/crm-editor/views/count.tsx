/* Display approximate count of entries in a database table. */

import { useState } from "react";
import { useAsyncEffect } from "use-async-effect";
import { Alert, Statistic } from "antd";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { Loading } from "@cocalc/frontend/components/loading";
import { SCHEMA } from "@cocalc/util/db-schema";

interface Props {
  dbtable: string;
  name?: string;
  lowerBound?: number;
}

export default function Count({ name, dbtable, lowerBound }: Props) {
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
        <Statistic
          title={
            <>
              <b>Approximate</b> Count of all {name ?? dbtable}
            </>
          }
          value={count}
        />
      )}
      {!error && count == null && <Loading />}
    </div>
  );
}
