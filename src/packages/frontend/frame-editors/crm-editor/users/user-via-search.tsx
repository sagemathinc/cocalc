/*
Shows details about the first user that matches the query.
*/

import { useEffect, useState } from "react";
import { Alert, Spin } from "antd";
import search from "./search";
import User from "./user";

interface Props {
  query: string;
}

export default function UserViaSearch({ query }: Props) {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const result = await search({ query, admin: true, limit: 100 });
        setUsers(result);
      } catch (error) {
        setError(error.message);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [query]);

  if (loading) {
    return <Spin />;
  }

  if (error !== "") {
    return <Alert message={error} type="error" />;
  }

  if (users.length === 0) {
    return <Alert message="No results found" type="warning" />;
  }

  const user = users[0] as any;

  return <User {...user} />;
}
