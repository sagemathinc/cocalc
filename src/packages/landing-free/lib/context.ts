import { createContext, useContext } from "react";
import type { Customize } from "@cocalc/util-node/server-settings/customize";

export const CustomizeContext = createContext<Partial<Customize>>({});

export const useCustomize = () => {
  return useContext(CustomizeContext);
};
