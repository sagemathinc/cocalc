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
