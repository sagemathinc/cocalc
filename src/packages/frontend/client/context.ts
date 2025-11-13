// in the frontend, webapp_client is set.  This is a way for the frontend to get that but nextjs doesn't,
// but in the same code.

import { createContext, useContext } from "react";

export interface ClientState {
  client?;
}

export const ClientContext = createContext<ClientState>({});

export default function useClientContext() {
  return useContext(ClientContext);
}
