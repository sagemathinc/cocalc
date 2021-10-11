import { createContext, useContext } from "react";
import type { Customize as ServerCustomize } from "@cocalc/backend/server-settings/customize";

interface Customize extends ServerCustomize {
  account?: { account_id: string };
}

const CustomizeContext = createContext<Partial<Customize>>({});
const { Provider } = CustomizeContext;
export const useCustomize = () => useContext(CustomizeContext) ?? {};
export { Provider as Customize };
