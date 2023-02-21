import { timeInSeconds } from "./util";

test("use the timeInSeconds code gen function", () => {
  const s = timeInSeconds("public_paths.last_edited", "last_edited");
  expect(s).toEqual(
    " (EXTRACT(EPOCH FROM public_paths.last_edited)*1000)::FLOAT as last_edited "
  );
});

import { expireTime } from "./util";

test("using expireTime to compute a time in the future", () => {
  const now = new Date().getTime();
  const now10 = expireTime(10).getTime();
  // sometimes, this is off by one. expect.toBeCloseTo only checks after the decimal point
  // increasing to 100 due to flakiness -- https://github.com/sagemathinc/cocalc/issues/6387
  expect(Math.abs(now10 - now - 10000)).toBeLessThanOrEqual(100);
});
