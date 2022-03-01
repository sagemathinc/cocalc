import type { KernelSpec } from "./parse";
import { createContext, useContext } from "react";

interface NBViewerContext {
  kernelspec: KernelSpec;
}

export const Context = createContext<NBViewerContext>({
  kernelspec: { display_name: "Unknown Kernel" },
});

const useNBViewerContext: () => NBViewerContext = () => {
  return useContext(Context);
};

export default useNBViewerContext;
