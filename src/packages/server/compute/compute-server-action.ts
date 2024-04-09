import type { Action } from "@cocalc/util/db-schema/compute-servers";
import { start, stop, suspend, resume, reboot, deprovision } from "./control";

interface Options {
  id: number;
  account_id: string;
  action: Action;
}

export default async function computeServerAction({
  id,
  account_id,
  action,
}: Options): Promise<void> {
  switch (action) {
    case "start":
      return await start({ id, account_id });
    case "stop":
      return await stop({ id, account_id });
    case "reboot":
      return await reboot({ id, account_id });
    case "suspend":
      return await suspend({ id, account_id });
    case "resume":
      return await resume({ id, account_id });
    case "deprovision":
      return await deprovision({ id, account_id });
    default:
      throw Error(`action '${action}' not implemented`);
  }
}
