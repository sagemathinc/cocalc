import { createContext, useContext, useEffect, useState } from "react";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import TTL from "@isaacs/ttlcache";

interface Person {
  id: number;
  name?: string;
  email_addresses?: string;
}

interface PeopleContextType {
  cache: TTL<number, Person>;
}

const PeopleContext = createContext<PeopleContextType>({
  cache: new TTL<number, Person>({ ttl: 30000 }),
});

export function PeopleProvider({ children }) {
  const cache = new TTL<number, Person>({ ttl: 30000 });
  return (
    <PeopleContext.Provider value={{ cache }}>
      {children}
    </PeopleContext.Provider>
  );
}

export function usePerson(id: number): Person | undefined {
  const { cache } = useContext(PeopleContext);

  const [person, setPerson] = useState<Person | undefined>(cache.get(id));

  useEffect(() => {
    if (person != null) return;
    (async () => {
      // todo: what happens when id is invalid?
      const x = await webapp_client.query_client.query({
        query: { crm_people: { id, name: null, email_addresses: null } },
      });
      cache.set(id, x.query.crm_people);
      setPerson(x.query.crm_people);
    })();
  }, []);

  return person;
}

async function peopleSearch(query: string): Promise<Person[] | null> {
  query = query.trim();
  if (!query) {
    // view this as cancelling the search rather than returning everything
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
    options: [{ limit: 3 }],
  });

  return x.query.crm_people;
}

export function usePeopleSearch(query: string): {
  matches: Person[] | null;
  loading: boolean;
  error: string;
} {
  const [error, setError] = useState<string>("");
  const [matches, setMatches] = useState<Person[] | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    setError("");
    setMatches(null);
    setLoading(true);
    (async () => {
      try {
        let matches = await peopleSearch(query);
        setMatches(matches);
      } catch (err) {
        setError(`${err}`);
      } finally {
        setLoading(false);
      }
    })();
  }, [query]);

  return { error, matches, loading };
}
