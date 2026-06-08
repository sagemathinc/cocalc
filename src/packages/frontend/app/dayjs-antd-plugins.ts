/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Register the dayjs plugins that antd's date/time components (DatePicker,
RangePicker, TimePicker, ...) rely on.

WHY THIS EXISTS
===============
antd's pickers are built on `rc-picker`, whose dayjs adapter
(rc-picker/es/generate/dayjs.js) calls `dayjs.extend(weekday)`,
`dayjs.extend(localeData)`, etc. on *its own* imported dayjs instance.

In a production bundle there can be more than one dayjs module instance
(e.g. our app code resolves `dayjs@1.11.13` while another dependency drags in
`dayjs@1.11.19`, and ESM/CJS interop can further duplicate instances). When
that happens, the dayjs objects our app code creates with `import dayjs from
"dayjs"` and hands to a picker via its `value` prop come from an instance that
was NEVER extended by rc-picker. rc-picker then calls e.g.
`generateConfig.getWeekDay(value)` -> `value.weekday()` on our object and
throws:

    TypeError: t.weekday is not a function
        at Object.getWeekDay ...

In dev this is usually invisible because the bundler dedupes dayjs to a single
instance, so rc-picker's own `extend` calls happen to also cover our instance.
The bug only shows up in the minified production bundle.

THE FIX
=======
Extend the same set of plugins rc-picker needs, on the dayjs instance our app
code uses. Importing this module for its side effects from each app entry point
(before any picker renders) guarantees that every dayjs object we pass to antd
has these plugin methods, regardless of how many dayjs instances the bundler
produced.

Keep this list in sync with rc-picker/es/generate/dayjs.js.
*/

import dayjs from "dayjs";
import advancedFormat from "dayjs/plugin/advancedFormat";
import customParseFormat from "dayjs/plugin/customParseFormat";
import localeData from "dayjs/plugin/localeData";
import weekday from "dayjs/plugin/weekday";
import weekOfYear from "dayjs/plugin/weekOfYear";
import weekYear from "dayjs/plugin/weekYear";

// Register the plugins antd's pickers (via rc-picker) require on the value
// objects we pass in. Order matches rc-picker's own adapter for clarity.
dayjs.extend(customParseFormat);
dayjs.extend(advancedFormat);
dayjs.extend(weekday);
dayjs.extend(localeData);
dayjs.extend(weekOfYear);
dayjs.extend(weekYear);

export default dayjs;
