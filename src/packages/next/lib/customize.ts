import { createContext, useContext } from "react";
import type { Customize as ServerCustomize } from "@cocalc/backend/server-settings/customize";

interface Customize extends ServerCustomize {
  account?: {
    account_id: string;
    first_name?: string;
    last_name?: string;
    email_address?: string;
    name?: string;
  };
}

const CustomizeContext = createContext<Partial<Customize>>({});
const { Provider } = CustomizeContext;
export const useCustomize = () => useContext(CustomizeContext) ?? {};
export { Provider as Customize };
export type { Customize as CustomizeType };
