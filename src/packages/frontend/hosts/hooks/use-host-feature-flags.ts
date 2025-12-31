import { useTypedRedux } from "@cocalc/frontend/app-framework";

export const useHostFeatureFlags = () => {
  const gcpEnabled = useTypedRedux(
    "customize",
    "compute_servers_google-cloud_enabled",
  );
  const hyperstackEnabled = useTypedRedux(
    "customize",
    "compute_servers_hyperstack_enabled",
  );
  const lambdaEnabled = useTypedRedux("customize", "compute_servers_lambda_enabled");
  const nebiusEnabled = useTypedRedux("customize", "project_hosts_nebius_enabled");
  const showLocal =
    typeof window !== "undefined" && window.location.hostname === "localhost";

  return {
    gcpEnabled: !!gcpEnabled,
    hyperstackEnabled: !!hyperstackEnabled,
    lambdaEnabled: !!lambdaEnabled,
    nebiusEnabled: !!nebiusEnabled,
    showLocal,
  };
};
