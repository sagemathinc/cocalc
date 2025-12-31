import { useMemo } from "@cocalc/frontend/app-framework";
import type { FormInstance } from "antd/es/form";
import type { HostProvider, HostRecommendation } from "../types";

export type HostCreateViewModel = {
  permissions: {
    isAdmin: boolean;
    canCreateHosts: boolean;
  };
  form: {
    form: FormInstance;
    creating: boolean;
    onCreate: (vals: any) => Promise<void>;
  };
  provider: {
    providerOptions: Array<{ value: HostProvider; label: string }>;
    selectedProvider: HostProvider;
    regionOptions: Array<{ value: string; label: string }>;
    hyperstackFlavorOptions: Array<{ value: string; label: string }>;
    lambdaInstanceTypeOptions: Array<{
      value: string;
      label: string;
      disabled?: boolean;
    }>;
    nebiusInstanceTypeOptions: Array<{ value: string; label: string }>;
    zoneOptions: Array<{ value: string; label: string }>;
    machineTypeOptions: Array<{ value: string; label: string }>;
    imageOptions: Array<{ value: string; label: string }>;
    gpuTypeOptions: Array<{ value: string; label: string }>;
    storageModeOptions: Array<{ value: string; label: string }>;
    supportsPersistentStorage: boolean;
    persistentGrowable: boolean;
    showDiskFields: boolean;
    catalogError?: string;
  };
  catalogRefresh: {
    refreshProviders: Array<{ value: HostProvider; label: string }>;
    refreshProvider: HostProvider;
    setRefreshProvider: (value: HostProvider) => void;
    refreshCatalog: () => Promise<boolean>;
    catalogRefreshing: boolean;
  };
  ai: {
    aiQuestion: string;
    setAiQuestion: (value: string) => void;
    aiBudget?: number;
    setAiBudget: (value?: number) => void;
    aiRegionGroup: string;
    setAiRegionGroup: (value: string) => void;
    aiLoading: boolean;
    aiError?: string;
    aiResults: HostRecommendation[];
    canRecommend: boolean;
    runAiRecommendation: () => void;
    applyRecommendation: (rec: HostRecommendation) => void;
  };
};

type UseHostCreateViewModelArgs = HostCreateViewModel;

export const useHostCreateViewModel = (args: UseHostCreateViewModelArgs) =>
  useMemo(() => args, [args]);
