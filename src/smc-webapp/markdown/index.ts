/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Conversion from Markdown *to* HTML, trying not to horribly mangle math.

We also define and configure our Markdown parsers below, which are used
in other code directly, e.g, in supporting use of the slate editor.
```
*/

export * from "./types";
export * from "./table-of-contents";
export * from "./markdown";
export { parseHeader } from "./header";


