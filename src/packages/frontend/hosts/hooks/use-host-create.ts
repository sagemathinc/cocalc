import { useState } from "@cocalc/frontend/app-framework";
import { message } from "antd";
import {
  buildCreateHostPayload,
  type FieldOptionsMap,
} from "../providers/registry";
import type { HostCatalog } from "@cocalc/conat/hub/api/hosts";

type HubClient = {
  hosts: {
    createHost: (opts: any) => Promise<unknown>;
  };
};

type UseHostCreateOptions = {
  hub: HubClient;
  refresh: () => Promise<unknown>;
  fieldOptions: FieldOptionsMap;
  catalog?: HostCatalog;
};

export const useHostCreate = ({
  hub,
  refresh,
  fieldOptions,
  catalog,
}: UseHostCreateOptions) => {
  const [creating, setCreating] = useState(false);

  const onCreate = async (vals: any) => {
    if (creating) return;
    setCreating(true);
    try {
      const payload = buildCreateHostPayload(vals, { fieldOptions, catalog });
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
