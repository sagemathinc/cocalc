import { useEffect, useState } from "react";
import apiPost from "lib/api/post";
import useIsMounted from "./mounted";

export default function useQuery(initialQuery?): {
  error: string;
  value: any;
  loading: boolean;
  query: (any) => Promise<any>;
} {
  const isMounted = useIsMounted();
  const [value, setValue] = useState<any>(initialQuery);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(!!initialQuery);

  async function query(query) {
    setLoading(true);
    let result;
    try {
      result = await apiPost("/user-query", { query });
    } catch (err) {
      if (!isMounted.current) return;
      const error = `${err}`;
      setError(error);
      setLoading(false);
      return { error };
    }
    if (!isMounted.current) return;
    if (result.error) {
      setError(result.error);
    } else {
      setValue(result.query);
    }
    setLoading(false);
    return result;
  }

  useEffect(() => {
    if (initialQuery) {
      query(initialQuery);
    }
  }, []);

  return { error, value, loading, query };
}
