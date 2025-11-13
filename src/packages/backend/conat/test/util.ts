import { until } from "@cocalc/util/async-utils";

export async function wait({
  until: f,
  start = 5,
  decay = 1.2,
  max = 300,
  timeout = 10000,
}: {
  until: Function;
  start?: number;
  decay?: number;
  max?: number;
  timeout?: number;
}) {
  await until(
    async () => {
      try {
        return !!(await f());
      } catch {
        return false;
      }
    },
    {
      start,
      decay,
      max,
      min: 5,
      timeout,
    },
  );
}
