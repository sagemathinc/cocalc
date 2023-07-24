/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { COLORS } from "@cocalc/util/theme";

export const EMAIL_TEMPLATES = {
  welcome: {
    subject: "Welcome to CoCalc",
    template: `
## Hello {{name}}!

Welcome to {{siteName}}. We're excited to have you on board.

If you have any questions, please contact us at {{helpEmail}}.

Thanks,

The {{siteName}} Team
`,
  },
  password_reset: {
    subject: "Password Reset",
    template: `
## Hello {{name}}!

You have requested a password reset. Please click the link below to reset your password.

{{resetLink}}

If you did not request a password reset, please ignore this email.
`,
  },
} as const;

export type EmailTemplateName = keyof typeof EMAIL_TEMPLATES;
export const TEMPLATE_NAMES = Object.keys(
  EMAIL_TEMPLATES
) as EmailTemplateName[];

export const EMAIL_ELEMENTS = {
  header: `<div style="text-align: center; padding: 1em 0; margin: 1em 0; border-bottom: 3px solid ${COLORS.COCALC_ORANGE}">
    <img src="{{logoSquare}}" alt="{{siteName}}" style="width: 100px; height: 100px; margin: 0 auto; display: block;" />
    <h2>{{siteName}}</h2>
    </div>`,
  footer: `<div style="margin-top: 3em; padding: 1em 0; border-top: 3px solid ${COLORS.COCALC_ORANGE}">
  To unsubscribe from these emails, please visit the <a href="https://{{dns}}/email">email configuration center</a>.
  </div>`,
};

// based on https://meyerweb.com/eric/tools/css/reset/ and juice will inline it for html emails
export const RESET_CSS = `
html, body, div, span, applet, object, iframe, h1, h2, h3, h4, h5, h6, p, blockquote, pre,
a, abbr, acronym, address, big, cite, code, del, dfn, em, img, ins, kbd, q, s, samp,
small, strike, strong, sub, sup, tt, var, b, u, i, center,
dl, dt, dd, ol, ul, li, fieldset, form, label, legend, table, caption, tbody, tfoot, thead, tr, th, td,
article, aside, canvas, details, embed, figure, figcaption, footer, header, hgroup,
menu, nav, output, ruby, section, summary, time, mark, audio, video {
	margin: 0;
	padding: 0;
	border: 0;
	font-size: 100%;
	font: sans-serif;
	vertical-align: baseline;
}
article, aside, details, figcaption, figure, footer, header, hgroup, menu, nav, section {
	display: block;
}
body {
	line-height: 1;
}
ol, ul {
	list-style: none;
}
blockquote, q {
	quotes: none;
}
blockquote:before, blockquote:after,
q:before, q:after {
	content: '';
	content: none;
}
table {
	border-collapse: collapse;
	border-spacing: 0;
}`;
