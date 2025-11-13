/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { register_file_editor } from "../../project-file";

register_file_editor({
  ext: [""],
  icon: "question-circle",
  componentAsync: async () => (await import("./editor")).UnknownEditor,
});
