import type { KernelSpec } from "./nbviewer/parse";
import { createContext, useContext } from "react";

interface IJupyterContext {
  kernelspec: KernelSpec;
}

export const JupyterContext = createContext<IJupyterContext>({
  kernelspec: { display_name: "Unknown Kernel", name: "unknown" },
});

const useJupyterContext: () => IJupyterContext = () => {
  return useContext(JupyterContext);
};

export default useJupyterContext;
