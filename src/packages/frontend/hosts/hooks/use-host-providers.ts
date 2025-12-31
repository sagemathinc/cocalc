import { useEffect, useMemo, useState } from "@cocalc/frontend/app-framework";
import { Form, type FormInstance } from "antd";
import type { HostProvider } from "../types";
import { PROVIDERS } from "../constants";

type UseHostProvidersArgs = {
  form: FormInstance;
  gcpEnabled: boolean;
  hyperstackEnabled: boolean;
  lambdaEnabled: boolean;
  nebiusEnabled: boolean;
  showLocal: boolean;
};

const isProviderEnabled = (
  provider: HostProvider,
  flags: Pick<
    UseHostProvidersArgs,
    "gcpEnabled" | "hyperstackEnabled" | "lambdaEnabled" | "nebiusEnabled"
  >,
) => {
  switch (provider) {
    case "gcp":
      return flags.gcpEnabled;
    case "hyperstack":
      return flags.hyperstackEnabled;
    case "lambda":
      return flags.lambdaEnabled;
    case "nebius":
      return flags.nebiusEnabled;
    default:
      return false;
  }
};

const pickFallbackProvider = (
  current: HostProvider,
  flags: Pick<
    UseHostProvidersArgs,
    "gcpEnabled" | "hyperstackEnabled" | "lambdaEnabled" | "nebiusEnabled"
  >,
): HostProvider => {
  const order: Record<HostProvider, HostProvider[]> = {
    gcp: ["hyperstack", "lambda", "nebius"],
    hyperstack: ["gcp", "lambda", "nebius"],
    lambda: ["gcp", "hyperstack", "nebius"],
    nebius: ["gcp", "hyperstack", "lambda"],
    none: ["gcp", "hyperstack", "lambda", "nebius"],
  };

  for (const provider of order[current] ?? []) {
    if (isProviderEnabled(provider, flags)) {
      return provider;
    }
  }
  return current;
};

export const useHostProviders = ({
  form,
  gcpEnabled,
  hyperstackEnabled,
  lambdaEnabled,
  nebiusEnabled,
  showLocal,
}: UseHostProvidersArgs) => {
  const [refreshProvider, setRefreshProvider] = useState<HostProvider>("gcp");
  const selectedProvider = Form.useWatch("provider", form) as
    | HostProvider
    | undefined;

  const providerOptions = useMemo(() => {
    return PROVIDERS.filter((opt) => {
      if (opt.value === "gcp") return !!gcpEnabled;
      if (opt.value === "hyperstack") return !!hyperstackEnabled;
      if (opt.value === "lambda") return !!lambdaEnabled;
      if (opt.value === "nebius") return !!nebiusEnabled;
      if (opt.value === "none") return showLocal;
      return false;
    });
  }, [gcpEnabled, hyperstackEnabled, lambdaEnabled, nebiusEnabled, showLocal]);

  const catalogProvider = useMemo(() => {
    if (selectedProvider && selectedProvider !== "none") {
      return selectedProvider;
    }
    return providerOptions[0]?.value;
  }, [selectedProvider, providerOptions]);

  const refreshProviders = useMemo(() => {
    const opts: Array<{ value: HostProvider; label: string }> = [];
    if (gcpEnabled) opts.push({ value: "gcp", label: "GCP" });
    if (hyperstackEnabled)
      opts.push({ value: "hyperstack", label: "Hyperstack" });
    if (lambdaEnabled) opts.push({ value: "lambda", label: "Lambda Cloud" });
    if (nebiusEnabled) opts.push({ value: "nebius", label: "Nebius" });
    return opts;
  }, [gcpEnabled, hyperstackEnabled, lambdaEnabled, nebiusEnabled]);

  useEffect(() => {
    if (selectedProvider === "gcp" && !gcpEnabled) {
      form.setFieldsValue({ provider: "none" });
    } else if (selectedProvider === "hyperstack" && !hyperstackEnabled) {
      form.setFieldsValue({ provider: "none" });
    } else if (selectedProvider === "lambda" && !lambdaEnabled) {
      form.setFieldsValue({ provider: "none" });
    } else if (selectedProvider === "nebius" && !nebiusEnabled) {
      form.setFieldsValue({ provider: "none" });
    } else if (!selectedProvider) {
      form.setFieldsValue({ provider: providerOptions[0]?.value ?? "none" });
    }
  }, [
    selectedProvider,
    gcpEnabled,
    hyperstackEnabled,
    lambdaEnabled,
    nebiusEnabled,
    providerOptions,
    form,
  ]);

  useEffect(() => {
    if (
      (refreshProvider === "gcp" && !gcpEnabled) ||
      (refreshProvider === "hyperstack" && !hyperstackEnabled) ||
      (refreshProvider === "lambda" && !lambdaEnabled) ||
      (refreshProvider === "nebius" && !nebiusEnabled)
    ) {
      setRefreshProvider(
        pickFallbackProvider(refreshProvider, {
          gcpEnabled,
          hyperstackEnabled,
          lambdaEnabled,
          nebiusEnabled,
        }),
      );
    }
  }, [
    refreshProvider,
    gcpEnabled,
    hyperstackEnabled,
    lambdaEnabled,
    nebiusEnabled,
  ]);

  return {
    providerOptions,
    refreshProviders,
    selectedProvider,
    catalogProvider,
    refreshProvider,
    setRefreshProvider,
  };
};
