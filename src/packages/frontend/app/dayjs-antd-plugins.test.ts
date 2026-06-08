/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Regression test for the antd DatePicker "weekday is not a function" crash.

antd's pickers (via rc-picker) call dayjs plugin methods such as
`.weekday()` and `.localeData()` on the dayjs objects we hand them. Those
methods only exist if the corresponding plugins were registered via
`dayjs.extend(...)` on *our* dayjs instance. When they aren't, the store's
license start/end date picker throws:

    TypeError: t.weekday is not a function
        at Object.getWeekDay ...

See ./dayjs-antd-plugins.ts for the full explanation.
*/

import { readFileSync } from "fs";
import { join } from "path";

import dayjs from "dayjs";

// Importing the setup module for its side effects is exactly what the app
// entry points do. After this, our dayjs instance must have all the plugins.
import "./dayjs-antd-plugins";

describe("antd dayjs plugin registration", () => {
  it("exposes the plugin methods rc-picker needs on a dayjs object", () => {
    const d = dayjs();
    expect(typeof d.weekday).toBe("function");
    expect(typeof d.localeData).toBe("function");
    expect(typeof d.week).toBe("function"); // weekOfYear
    expect(typeof d.weekYear).toBe("function");
  });

  it("reproduces rc-picker's getWeekDay() without throwing", () => {
    // This mirrors rc-picker/es/generate/dayjs.js getWeekDay(), the exact
    // call site that threw "t.weekday is not a function" in production.
    const getWeekDay = (date: dayjs.Dayjs): number => {
      const clone = date.locale("en");
      return clone.weekday() + clone.localeData().firstDayOfWeek();
    };
    expect(() => getWeekDay(dayjs("2026-06-08"))).not.toThrow();
    expect(typeof getWeekDay(dayjs("2026-06-08"))).toBe("number");
  });

  it("supports advancedFormat tokens (Q, Do, k, ...)", () => {
    // advancedFormat adds tokens like Q (quarter) and Do (ordinal day).
    expect(dayjs("2026-06-08").format("Q")).toBe("2");
    expect(dayjs("2026-06-08").format("Do")).toBe("8th");
  });

  it("supports customParseFormat parsing", () => {
    const d = dayjs("08-06-2026", "DD-MM-YYYY");
    expect(d.isValid()).toBe(true);
    expect(d.year()).toBe(2026);
    expect(d.month()).toBe(5); // June (0-indexed)
    expect(d.date()).toBe(8);
  });
});

describe("antd dayjs plugins are wired into the app entry points", () => {
  // Guard against silently dropping the side-effect import that activates the
  // fix. If these break, the production picker crash will come back.
  const setupImport = "app/dayjs-antd-plugins";

  it("frontend entry-point.ts imports the dayjs plugin setup", () => {
    const src = readFileSync(join(__dirname, "..", "entry-point.ts"), "utf8");
    expect(src).toContain(setupImport);
  });

  it("next _app.tsx imports the dayjs plugin setup", () => {
    const appPath = join(
      __dirname,
      "..",
      "..",
      "next",
      "pages",
      "_app.tsx",
    );
    const src = readFileSync(appPath, "utf8");
    expect(src).toContain(setupImport);
  });
});
