/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
These are some hacks to deal with issues with bootstrap 3.

DEPRECATION WARNING:

No clue why or what these are actually for or how to reproduce that
we need them.  We will clearly delete them once we delete our use
of bootstrap 3 (in favor of antd).

*/

// Bootstrap 3 modal fix
$("html").on("hide.bs.modal", "body > .modal", function () {
  $(this).remove();
});

// Bootstrap 3 tooltip fix
$("body").on("show.bs.tooltip", (e) =>
  setTimeout(
    () => ($(e.target).parent().find(".tooltip") as any)?.tooltip("hide"),
    3000
  )
);
