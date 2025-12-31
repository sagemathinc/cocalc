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
    if (refreshProvider === "gcp" && !gcpEnabled) {
      setRefreshProvider(
        hyperstackEnabled
          ? "hyperstack"
          : lambdaEnabled
            ? "lambda"
            : nebiusEnabled
              ? "nebius"
              : "gcp",
      );
    } else if (refreshProvider === "hyperstack" && !hyperstackEnabled) {
      setRefreshProvider(
        gcpEnabled
          ? "gcp"
          : lambdaEnabled
            ? "lambda"
            : nebiusEnabled
              ? "nebius"
              : "hyperstack",
      );
    } else if (refreshProvider === "lambda" && !lambdaEnabled) {
      setRefreshProvider(
        gcpEnabled
          ? "gcp"
          : hyperstackEnabled
            ? "hyperstack"
            : nebiusEnabled
              ? "nebius"
              : "lambda",
      );
    } else if (refreshProvider === "nebius" && !nebiusEnabled) {
      setRefreshProvider(
        gcpEnabled
          ? "gcp"
          : hyperstackEnabled
            ? "hyperstack"
            : lambdaEnabled
              ? "lambda"
              : "nebius",
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
    refreshProvider,
    setRefreshProvider,
  };
};
