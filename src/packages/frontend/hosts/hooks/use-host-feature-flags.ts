import { useRedux } from "@cocalc/frontend/app-framework";
import { getProviderEnablement } from "../providers/registry";

export const useHostFeatureFlags = () => {
  const customize = useRedux(["customize"]);
  const showLocal =
    typeof window !== "undefined" && window.location.hostname === "localhost";
  return getProviderEnablement({ customize, showLocal });
};
