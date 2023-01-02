/*
TTL cache used for caching queries to the database.
*/

import { createContext, useContext } from "react";
import TTL from "@isaacs/ttlcache";

interface ContextType {
  caches: { [table: string]: TTL<any, any> };
}

// 30 second ttl -- may adjust based on what we learn...
const DEFAULT_TTL = 30000;

const CacheContext = createContext<ContextType>({
  caches: {},
});

export function QueryCache({ children }) {
  return (
    <CacheContext.Provider value={{ caches: {} }}>
      {children}
    </CacheContext.Provider>
  );
}

export function useQueryCache<KeyType, ValueType>(
  table: string,
  ttl: number = DEFAULT_TTL // in ms; only first value given matters (can't change)
): TTL<KeyType, ValueType> {
  const { caches } = useContext(CacheContext);
  if (caches[table] == null) {
    caches[table] = new TTL<KeyType, ValueType>({ ttl });
  }
  return caches[table];
}
