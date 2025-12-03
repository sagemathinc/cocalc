import getLogger from "@cocalc/backend/logger";
import { createServiceHandler } from "@cocalc/conat/service/typed";
import { upsertProjectHost, type ProjectHostRecord } from "@cocalc/database/postgres/project-hosts";

const logger = getLogger("server:conat:host-registry");

export interface HostRegistration extends ProjectHostRecord {}

export interface HostRegistryApi {
  register: (info: HostRegistration) => Promise<void>;
  heartbeat: (info: HostRegistration) => Promise<void>;
}

const SUBJECT = "project-hosts";

export async function initHostRegistryService() {
  logger.info("starting host registry service");
  return await createServiceHandler<HostRegistryApi>({
    service: SUBJECT,
    subject: `${SUBJECT}.api`,
    description: "Registry/heartbeat for project-host nodes",
    impl: {
      async register(info: HostRegistration) {
        if (!info?.id) {
          throw Error("register: id is required");
        }
        logger.debug("register", { id: info.id, region: info.region, url: info.public_url });
        await upsertProjectHost({
          ...info,
          status: info.status ?? "active",
          last_seen: new Date(),
        });
      },
      async heartbeat(info: HostRegistration) {
        if (!info?.id) {
          throw Error("heartbeat: id is required");
        }
        logger.silly?.("heartbeat", { id: info.id, status: info.status });
        await upsertProjectHost({
          ...info,
          status: info.status ?? "active",
          last_seen: new Date(),
        });
      },
    },
  });
}
