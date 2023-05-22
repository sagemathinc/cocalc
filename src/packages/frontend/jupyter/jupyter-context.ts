import type { KernelSpec } from "@cocalc/jupyter/ipynb/parse";
import { createContext, useContext } from "react";

interface IJupyterContext {
  kernelspec?: KernelSpec; // could be undefined if the kernel is unknown
  trust?: boolean;
}

export const JupyterContext = createContext<IJupyterContext>({
  kernelspec: {
    display_name: "Unknown Kernel",
    name: "unknown",
    language: "unknown",
  },
});

const useJupyterContext: () => IJupyterContext = () => {
  return useContext(JupyterContext);
};

export default useJupyterContext;
