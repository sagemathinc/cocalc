import { useEffect, useRef, useState } from "react";
import apiPost from "lib/api/post";
import useIsMounted from "./mounted";

export default function useQuery(initialQuery) {
  const isMounted = useIsMounted();
  const [value, setValue] = useState<any>(initialQuery);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(!!initialQuery);

  async function query(query, loading = true) {
    setLoading(true);
    let result;
    try {
      result = await apiPost("/user-query", { query });
    } catch (err) {
      if (!isMounted.current) return;
      setError(`${err}`);
      setLoading(false);
      return;
    }
    if (!isMounted.current) return;
    if (result.error) {
      setError(result.error);
    } else {
      setValue(result.query);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (initialQuery) {
      query(initialQuery);
    }
  }, []);

  return { error, value, loading, query };
}
