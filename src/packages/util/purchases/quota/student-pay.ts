import dayjs from "dayjs";

import { STANDARD_DISK } from "@cocalc/util/consts/billing";
import type { PurchaseInfo } from "./types";

export const DEFAULT_PURCHASE_INFO = {
  type: "quota",
  version: "3",
  user: "academic",
  upgrade: "custom",
  quantity: 1,
  subscription: "no",
  custom_cpu: 1,
  custom_dedicated_cpu: 0,
  custom_ram: 4,
  custom_dedicated_ram: 0,
  custom_disk: STANDARD_DISK,
  custom_member: true,
  custom_uptime: "short",
  start: new Date(),
  end: dayjs().add(3, "month").toDate(),
} as PurchaseInfo;
