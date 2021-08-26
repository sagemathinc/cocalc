import { createContext, useContext } from "react";
import type { Customize } from "@cocalc/util-node/server-settings/customize";

const CustomizeContext = createContext<Partial<Customize>>({});
const { Provider } = CustomizeContext;
export const useCustomize = () => useContext(CustomizeContext) ?? {};
export { Provider as Customize };
