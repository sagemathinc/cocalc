import dayjs from "dayjs";
import createAccount0 from "@cocalc/server/accounts/create-account";
import { uuid } from "@cocalc/util/misc";

export const license0 = {
  cpu: 1,
  ram: 2,
  disk: 3,
  type: "quota",
  user: "academic",
  boost: true,
  range: [
    dayjs().add(1, "week").toISOString(),
    dayjs().add(1, "month").toISOString(),
  ],
  title: "as",
  member: true,
  period: "range",
  uptime: "short",
  run_limit: 1,
  description: "xxxx",
} as const;

export async function createAccount(account_id: string) {
  await createAccount0({
    email: `${uuid()}@test.com`,
    password: "cocalcrulez",
    firstName: "Test",
    lastName: "User",
    account_id,
  });
}
