import { useEffect, useState } from "react";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { useQueryCache } from "./use-query-cache";
import useIsMountedRef from "@cocalc/frontend/app-framework/is-mounted-hook";

export interface PersonType {
  id: number;
  name?: string;
  email_addresses?: string;
}

export function usePerson(id: number): PersonType | undefined {
  const isMountedRef = useIsMountedRef();
  const cache = useQueryCache<number, PersonType>("people");

  const [person, setPerson] = useState<PersonType | undefined>(cache.get(id));

  useEffect(() => {
    if (person != null) return;
    (async () => {
      // todo: what happens when id is invalid?
      const x = await webapp_client.query_client.query({
        query: { crm_people: { id, name: null, email_addresses: null } },
      });
      cache.set(id, x.query.crm_people);
      if (isMountedRef.current) {
        setPerson(x.query.crm_people);
      }
    })();
  }, []);

  return person;
}

async function peopleSearch(query: string): Promise<PersonType[] | null> {
  query = query.trim();
  if (!query) {
    // view this as canceling the search rather than returning everything
    return null;
  }

  const ILIKE = { ILIKE: `%${query}%` };
  let pattern;
  if (query.includes("@") || query.includes(".")) {
    // email address search
    pattern = { id: null, name: null, email_addresses: ILIKE };
  } else {
    // name search
    pattern = { id: null, name: ILIKE, email_addresses: null };
  }

  const x = await webapp_client.query_client.query({
    query: { crm_people: [pattern] },
    options: [{ limit: 100 }],
  });

  return x.query.crm_people;
}

export function usePeopleSearch(query: string): {
  matches: PersonType[] | null;
  loading: boolean;
  error: string;
} {
  const isMountedRef = useIsMountedRef();
  const [error, setError] = useState<string>("");
  const [matches, setMatches] = useState<PersonType[] | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    setError("");
    setMatches(null);
    setLoading(true);
    (async () => {
      try {
        let matches = await peopleSearch(query);
        if (isMountedRef.current) {
          setMatches(matches);
        }
      } catch (err) {
        if (isMountedRef.current) {
          setError(`${err}`);
        }
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    })();
  }, [query]);

  return { error, matches, loading };
}
