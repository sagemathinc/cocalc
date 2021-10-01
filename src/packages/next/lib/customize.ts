import { createContext, useContext } from "react";
import type { Customize as ServerCustomize } from "@cocalc/util-node/server-settings/customize";

interface Customize extends ServerCustomize {
  account?: { account_id: string };
}

const CustomizeContext = createContext<Partial<Customize>>({});
const { Provider } = CustomizeContext;
export const useCustomize = () => useContext(CustomizeContext) ?? {};
export { Provider as Customize };
