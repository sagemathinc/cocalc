import { timeInSeconds } from "./util";

test("use the timeInSeconds code gen function", () => {
  const s = timeInSeconds("public_paths.last_edited", "last_edited");
  expect(s).toEqual(
    " (EXTRACT(EPOCH FROM public_paths.last_edited)*1000)::FLOAT as last_edited "
  );
});

import { expireTime } from "./util";

test("using expireTime to compute a time in the future", () => {
  const now = new Date().valueOf();
  const now10 = expireTime(10).valueOf();
  expect(now10 - now).toBeCloseTo(10000);
});
