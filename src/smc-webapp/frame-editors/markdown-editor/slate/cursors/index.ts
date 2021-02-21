/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
- Display of other user's cursors
- Broadcast of own cursor.

One complication is that there's both a plain source code
view and an editable view, and clients could be using either,
so we want to show cursors in both places.

TODO:

- [ ] display cursors in slate editor (not just source)
   - [ ] a way to display them
   - [ ] convert coordinates from markdown to slate
        - will also be useful for implementing forward search

- [ ] special cases for working with void elements
   - [ ] code blocks
   - [ ] checkboxes
   - [ ] images, etc?
*/

export * from "./broadcast";
export * from "./other-users";
