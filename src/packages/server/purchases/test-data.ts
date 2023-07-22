import dayjs from "dayjs";

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
