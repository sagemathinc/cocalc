import { useEffect, useMemo, useState } from "@cocalc/frontend/app-framework";
import { Form, type FormInstance } from "antd";
import type { HostProvider } from "../types";
import {
  getProviderDescriptor,
  getProviderOptionsList,
  getRefreshProviders,
  type HostProviderFlags,
} from "../providers/registry";

type UseHostProvidersArgs = HostProviderFlags & {
  form: FormInstance;
};

const isProviderEnabled = (provider: HostProvider, flags: HostProviderFlags) =>
  getProviderDescriptor(provider).enabled(flags);

export const useHostProviders = ({
  form,
  gcpEnabled,
  hyperstackEnabled,
  lambdaEnabled,
  nebiusEnabled,
  showLocal,
}: UseHostProvidersArgs) => {
  const flags: HostProviderFlags = {
    gcpEnabled,
    hyperstackEnabled,
    lambdaEnabled,
    nebiusEnabled,
    showLocal,
  };
  const [refreshProvider, setRefreshProvider] = useState<HostProvider>("none");
  const selectedProvider = Form.useWatch("provider", form) as
    | HostProvider
    | undefined;

  const providerOptions = useMemo(
    () => getProviderOptionsList(flags),
    [flags],
  );

  const catalogProvider = useMemo(() => {
    if (selectedProvider && selectedProvider !== "none") {
      return selectedProvider;
    }
    return providerOptions[0]?.value;
  }, [selectedProvider, providerOptions]);

  const refreshProviders = useMemo(
    () => getRefreshProviders(flags),
    [flags],
  );

  useEffect(() => {
    if (selectedProvider && !isProviderEnabled(selectedProvider, flags)) {
      form.setFieldsValue({ provider: providerOptions[0]?.value ?? "none" });
    } else if (!selectedProvider) {
      form.setFieldsValue({ provider: providerOptions[0]?.value ?? "none" });
    }
  }, [
    selectedProvider,
    flags,
    providerOptions,
    form,
  ]);

  useEffect(() => {
    if (!isProviderEnabled(refreshProvider, flags)) {
      setRefreshProvider(refreshProviders[0]?.value ?? "none");
    }
  }, [refreshProvider, flags, refreshProviders]);

  return {
    providerOptions,
    refreshProviders,
    selectedProvider,
    catalogProvider,
    refreshProvider,
    setRefreshProvider,
  };
};
