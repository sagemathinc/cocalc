import { useState } from "@cocalc/frontend/app-framework";
import { message } from "antd";
import { buildCreateHostPayload } from "../utils/create-host";

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
      const payload = buildCreateHostPayload(vals, {
        hyperstackFlavorOptions,
        hyperstackRegionOptions,
        lambdaInstanceTypeOptions,
        lambdaRegionOptions,
        nebiusInstanceTypeOptions,
        nebiusRegionOptions,
      });
      await hub.hosts.createHost(payload);
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
