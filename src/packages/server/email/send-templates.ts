/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { path as ASSETS_DIR } from "@cocalc/assets";

import { Email } from "email-templates"; // https://email-templates.js.org/
import { join } from "node:path";
import { Message } from "./message";

// set this environment variable for your own set of templates
const TEMPLATES_ROOT =
  process.env.COCALC_EMAIL_TEMPLATES_ROOT ?? join(ASSETS_DIR, "emails");

console.log("TEMPLATES_ROOT", TEMPLATES_ROOT);

let templates: Email | null = null;

export function init(transport) {
  templates = new Email({
    send: true, // since we do not use NODE_ENV
    juice: true,
    // Override juice global settings <https://github.com/Automattic/juice#juicecodeblocks>
    juiceSettings: {
      tableElements: ["TABLE"],
    },
    juiceResources: {
      // set this to `true` (since as of v11 it is `false` by default)
      applyStyleTags: true,
      webResources: {
        relativeTo: join(TEMPLATES_ROOT, "assets"),
      },
    },
    transport,
    views: {
      root: TEMPLATES_ROOT,
      options: {
        extension: "ejs",
      },
    },
  });
}

export async function send(msg: Message): Promise<any> {
  if (templates == null) {
    throw new Error("email templates not initialized");
  }
  return await templates.send({
    template: "welcome",
    message: {
      to: "hsy@cocalc.com",
    },
    locals: {
      name: "Test Name",
      siteName: "CoCalc",
      ...msg,
    },
  });
}
