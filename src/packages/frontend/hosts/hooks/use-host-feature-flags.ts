import { useRedux } from "@cocalc/frontend/app-framework";
import { getProviderEnablement } from "../providers/registry";

export const useHostFeatureFlags = () => {
  const customize = useRedux(["customize"]);
  const isAdmin = !!useRedux(["account", "is_admin"]);
  const showLocal =
    isAdmin &&
    typeof window !== "undefined" &&
    window.location.hostname === "localhost";
  return getProviderEnablement({ customize, showLocal });
};
