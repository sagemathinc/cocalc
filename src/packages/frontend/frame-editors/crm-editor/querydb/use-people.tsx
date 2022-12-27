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
  console.log("peopleSearch", query);
  query = query.trim();
  if (!query) return null;
  return [
    {
      id: 1,
      name: "Clarita Tish Marie Lefthand Very Long Name Begay Stein",
      email_addresses: "a@b.c",
    },
    {
      id: 2,
      name: "William Stein",
      email_addresses: "wstein@gmail.com, wstein@cocalc.com",
    },
  ];
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
