/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { getServerSettings } from "@cocalc/database/settings";
import siteURL from "@cocalc/database/settings/site-url";
import getEmailAddress from "@cocalc/server/accounts/get-email-address";
import getName from "@cocalc/server/accounts/get-name";
import sendEmail from "@cocalc/server/email/send-email";
import getProjectTitle from "@cocalc/server/projects/get-title";
import { trunc } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import type { Action, Key } from "./types";

const HOWTO_REPLY = `Note: You have to either contact the person directly or respond via the linked chat.
Just replying to this email will not work.`;

export default async function sendNotificationIfPossible(
  key: Key,
  source: string,
  description: string,
): Promise<Action> {
  const to = await getEmailAddress(key.target);
  if (!to) {
    // Email is the only notification method at present.
    // Nothing more to do -- target user has no known email address.
    // They will see notification when they sign in.
    return "nothing";
  }

  const sourceName = trunc((await getName(source)) ?? "Unknown User", 60);
  const projectTitle = await getProjectTitle(key.project_id);

  const context =
    description.length > 0
      ? `<br/><blockquote>${description}</blockquote>`
      : "";
  const subject = `[${trunc(projectTitle, 40)}] ${key.path}`;
  const url = `${await siteURL()}/projects/${key.project_id}/files/${key.path}${
    key.fragment_id
      ? (key.fragment_id.startsWith("#") ? "" : "#") + key.fragment_id
      : ""
  }`;
  const html = `
${sourceName} mentioned you in
<a href="${url}">a chat at ${key.path} in ${projectTitle}</a>.
${context}
<br/>
<br/>
<div style="color: ${COLORS.GRAY_M};">${HOWTO_REPLY}</div>
`;

  const text = `
${sourceName} mentioned you in a chat at ${key.path} in ${projectTitle}.

    ${url}

${description ? "> " : ""}${description}

---

${HOWTO_REPLY}
`;

  const { help_email } = await getServerSettings();
  const from = `${sourceName} <${help_email}>`;

  await sendEmail(
    {
      from,
      to,
      subject,
      text,
      html,
      categories: ["notification"],
      asm_group: 148185, // see https://app.sendgrid.com/suppressions/advanced_suppression_manager
    },
    source,
  );
  return "email";
}
