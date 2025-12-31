import { useState } from "@cocalc/frontend/app-framework";
import { message } from "antd";
import { LAMBDA_REGIONS, SIZES } from "../constants";

type HubClient = {
  hosts: {
    createHost: (opts: any) => Promise<unknown>;
  };
};

type UseHostCreateOptions = {
  hub: HubClient;
  refresh: () => Promise<unknown>;
  hyperstackFlavorOptions: Array<{ value: string; flavor: any }>;
  hyperstackRegionOptions: Array<{ value: string }>;
  lambdaInstanceTypeOptions: Array<{ value: string; entry: any }>;
  lambdaRegionOptions: Array<{ value: string }>;
  nebiusInstanceTypeOptions: Array<{ value: string; entry: any }>;
  nebiusRegionOptions: Array<{ value: string }>;
};

export const useHostCreate = ({
  hub,
  refresh,
  hyperstackFlavorOptions,
  hyperstackRegionOptions,
  lambdaInstanceTypeOptions,
  lambdaRegionOptions,
  nebiusInstanceTypeOptions,
  nebiusRegionOptions,
}: UseHostCreateOptions) => {
  const [creating, setCreating] = useState(false);

  const onCreate = async (vals: any) => {
    if (creating) return;
    setCreating(true);
    try {
      const machine_type = vals.machine_type || undefined;
      const gpu_type =
        vals.gpu_type && vals.gpu_type !== "none" ? vals.gpu_type : undefined;
      const hyperstackFlavor = hyperstackFlavorOptions.find(
        (opt) => opt.value === vals.size,
      )?.flavor;
      const hyperstackGpuType =
        hyperstackFlavor && hyperstackFlavor.gpu !== "none"
          ? hyperstackFlavor.gpu
          : undefined;
      const hyperstackGpuCount = hyperstackFlavor?.gpu_count || 0;
      const lambdaInstanceType = lambdaInstanceTypeOptions.find(
        (opt) => opt.value === vals.machine_type,
      )?.entry;
      const lambdaGpuCount = lambdaInstanceType?.gpus ?? 0;
      const nebiusInstanceType = nebiusInstanceTypeOptions.find(
        (opt) => opt.value === vals.machine_type,
      )?.entry;
      const nebiusGpuCount = nebiusInstanceType?.gpus ?? 0;
      const genericGpuType =
        vals.gpu && vals.gpu !== "none" ? vals.gpu : undefined;
      const wantsGpu =
        vals.provider === "hyperstack"
          ? hyperstackGpuCount > 0
          : vals.provider === "gcp"
            ? !!gpu_type
            : vals.provider === "lambda"
              ? lambdaGpuCount > 0
              : vals.provider === "nebius"
                ? nebiusGpuCount > 0
                : !!genericGpuType;
      const storage_mode =
        vals.provider === "lambda"
          ? "ephemeral"
          : vals.storage_mode || "persistent";
      const defaultRegion =
        vals.provider === "hyperstack"
          ? hyperstackRegionOptions[0]?.value
          : vals.provider === "lambda"
            ? (lambdaRegionOptions[0]?.value ?? LAMBDA_REGIONS[0]?.value)
            : vals.provider === "nebius"
              ? nebiusRegionOptions[0]?.value
              : "us-east1";
      await hub.hosts.createHost({
        name: vals.name ?? "My Host",
        region: vals.region ?? defaultRegion,
        size: machine_type ?? vals.size ?? SIZES[0].value,
        gpu: wantsGpu,
        machine: {
          cloud: vals.provider !== "none" ? vals.provider : undefined,
          machine_type:
            vals.provider === "hyperstack"
              ? hyperstackFlavor?.name
              : vals.provider === "nebius"
                ? nebiusInstanceType?.name
                : machine_type,
          gpu_type:
            vals.provider === "hyperstack"
              ? hyperstackGpuType
              : vals.provider === "gcp"
                ? gpu_type
                : vals.provider === "lambda"
                  ? undefined
                  : vals.provider === "nebius"
                    ? nebiusInstanceType?.gpu_label
                  : genericGpuType,
          gpu_count:
            vals.provider === "hyperstack"
              ? hyperstackGpuCount || undefined
              : vals.provider === "gcp"
                ? gpu_type
                  ? 1
                  : undefined
                : vals.provider === "lambda"
                  ? lambdaGpuCount || undefined
                  : vals.provider === "nebius"
                    ? nebiusGpuCount || undefined
                  : genericGpuType
                    ? 1
                    : undefined,
          zone: vals.provider === "gcp" ? (vals.zone ?? undefined) : undefined,
          storage_mode,
          disk_gb: vals.disk,
          disk_type: vals.disk_type,
          source_image: vals.source_image || undefined,
          metadata: {
            shared: vals.shared,
            bucket: vals.bucket,
            boot_disk_gb: vals.boot_disk_gb,
          },
        },
      });
      await refresh();
      message.success("Host created");
    } catch (err) {
      console.error(err);
      message.error("Failed to create host");
    } finally {
      setCreating(false);
    }
  };

  return { creating, onCreate };
};
