import api from "@cocalc/frontend/client/api";
import type {
  Configuration,
  Cloud,
} from "@cocalc/util/db-schema/compute-servers";

export async function createServer(opts: {
  project_id: string;
  name?: string;
  color?: string;
  idle_timeout?: number;
  autorestart?: boolean;
  cloud?: Cloud;
  configuration?: Configuration;
}): Promise<number> {
  return await api("compute/create-server", opts);
}
