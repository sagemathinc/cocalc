/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import type { Action, Key } from "./types";
import getName from "@cocalc/server/accounts/get-name";
import getEmailAddress from "@cocalc/server/accounts/get-email-address";
import getProjectTitle from "@cocalc/server/projects/get-title";
import { trunc } from "@cocalc/util/misc";
import siteURL from "@cocalc/server/settings/site-url";
import { getServerSettings } from "@cocalc/server/settings";
import sendEmail from "@cocalc/server/email/send-email";

export default async function sendNotificationIfPossible(
  key: Key,
  source: string,
  description: string
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
  const url = `${await siteURL()}/projects/${key.project_id}/files/${key.path}`;
  const html = `
${sourceName} mentioned you in
<a href="${url}">a chat at ${key.path} in ${projectTitle}</a>.
${context}
`;

  const text = `
${sourceName} mentioned you in a chat at ${key.path} in ${projectTitle}.

    ${url}

${description ? "> " : ""}${description}
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
    source
  );
  return "email";
}
