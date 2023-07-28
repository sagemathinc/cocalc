/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { COLORS } from "@cocalc/util/theme";
import { EmailTemplate, EmailTemplateName } from "./types";

const welcome = `
# Welcome to {{siteName}}!

We're so glad you're here!
[{{siteName}}](siteURL) is a powerful platform for computation, collaboration, and education.
We aim to make it really easy for you to work with open-source scientific software in your web browser
and we're always here to help if you have [any questions](mailto:{{helpEmail}}).

You received this email because an account with the email address \`{{email_address}}\` was created.

---

## Exploring {{site_name}}

In {{site_name}} your work happens inside private projects.
These are personal workspaces which contain your files, computational worksheets, and data.
You can run your computations through the web interface, via interactive worksheets
and notebooks, or by executing a program in a terminal.
{{site_name}} supports online editing of Jupyter Notebooks, Sage Worksheets, LaTeX files, and much more.

## How to get from 0 to 100

- [CoCalc Manual](https://doc.cocalc.com/): learn more about CoCalc's features
- [CoCalc's Jupyter Notebooks](https://doc.cocalc.com/jupyter.html)
- [SageMath Worksheets](https://doc.cocalc.com/sagews.html)
- [Subscriptions](https://cocalc.com/pricing/subscriptions): make hosting more robust and increase project quotas
- [Teaching a course on CoCalc](https://doc.cocalc.com/teaching-instructors.html)
- [Troubleshooting connectivity issues](https://doc.cocalc.com/howto/connectivity-issues.html)
- [Common mathematical syntax errors](https://github.com/sagemathinc/cocalc/wiki/MathematicalSyntaxErrors): look into this if you are new to working with a programming language!

## Collaborating with others

You can invite collaborators to work with you inside a project.
Like you, they can edit the files in that project.
Edits are visible in real time for everyone online.
You can share your thoughts in a [side chat next to each document](https://doc.cocalc.com/chat.html).

## Software

- Mathematical Calculation: [SageMath](https://www.sagemath.org/), [SymPy](https://www.sympy.org/), etc.
- Statistics and Data Science: [R project](https://www.r-project.org/), [Pandas](http://pandas.pydata.org/),  [statsmodels](http://www.statsmodels.org/), [scikit-learn](http://scikit-learn.org/), [PyTorch](https://pytorch.org/),
[Tensorflow](https://www.tensorflow.org/), [Octave](https://cocalc.com/features/octave), [Julia](https://cocalc.com/features/julia), [NLTK](http://www.nltk.org/), and [much more](https://cocalc.com/software).

Visit our [Feature Overview Page](https://cocalc.com/features) for more details!

---

Do you have further questions? Please contact [{{helpEmail}}](mailto:{{helpEmail}}).

Thanks,

The {{siteName}} Team
`;

const password_reset = `
## Hello {{name}}!

Somebody just requested to change the password of your {{siteName}} account.
If you requested this password change, please click this link below to reset your password:

**[{{siteURL}}{{resetPath}}]({{siteURL}}{{resetPath}})**

If you did not request a password reset, please ignore this email.

---

In case of problems, [please contact support](mailto:{{helpEmail}}).
`;

const newsletter = `
## Hello {{name}}!

Here are the latest news about {{siteName}}:

{{news}}

---

Want to know more? Visit [Feature Overview Page](https://cocalc.com/features) for more details!

Do you have further questions? Please contact [{{helpEmail}}](mailto:{{helpEmail}}).
`;

type EmailTemplates = Record<EmailTemplateName, EmailTemplate>;

export const EMAIL_TEMPLATES: EmailTemplates = {
  welcome: {
    subject: "Welcome to CoCalc",
    template: welcome,
    unsubscribe: false,
  },
  password_reset: {
    subject: "Password Reset",
    template: password_reset,
    unsubscribe: false,
  },
  news: {
    subject: "Newsletter",
    template: newsletter,
    unsubscribe: true,
  },
} as const;

export const TEMPLATE_NAMES = Object.keys(
  EMAIL_TEMPLATES
) as EmailTemplateName[];

const header = `<div style="text-align: center; padding: 1em 0; margin: 1em 0 3em 0; border-bottom: 3px solid ${COLORS.COCALC_ORANGE}">
<img src="{{logoSquare}}" alt="{{siteName}}" style="width: 100px; height: 100px; margin: 0 auto 1em auto; display: block;" />
<h3><a href="{{siteURL}}">{{siteName}}</a></h2>
</div>`;

const footerUnsubscribe = `<div class="footer">
To unsubscribe from these emails, please visit the <a href="{{siteURL}}/email">email configuration center</a>.
</div>`;

const footerTransactional = `<div class="footer">
This email was sent to you because you have an account on {{siteName}}.
</div>`;

export const EMAIL_ELEMENTS = {
  header,
  footerUnsubscribe,
  footerTransactional,
};

// based on https://meyerweb.com/eric/tools/css/reset/ and juice will inline it for html emails
export const EMAIL_CSS = `
html, body, div, span, applet, object, iframe, h1, h2, h3, h4, h5, h6, p, blockquote, pre,
a, abbr, acronym, address, big, cite, code, del, dfn, em, img, ins, kbd, q, s, samp,
small, strike, strong, sub, sup, tt, var, b, u, i, center,
dl, dt, dd, ol, ul, li, fieldset, form, label, legend, table, caption, tbody, tfoot, thead, tr, th, td,
article, aside, canvas, details, embed, figure, figcaption, footer, header, hgroup,
menu, nav, output, ruby, section, summary, time, mark, audio, video {
	margin: 0;
	padding: 0;
	border: 0;
	font-size: 14pt;
  font-family: sans-serif;
  color: ${COLORS.GRAY_DD};
	vertical-align: baseline;
}
a { color: ${COLORS.COCALC_BLUE}; text-decoration: none; }
h1 { font-size: 200%; padding-bottom: 0.5em;}
h2 { font-size: 180%; padding-bottom: 0.45em;}
h3 { font-size: 160%; padding-bottom: 0.4em;}
h4 { font-size: 140%; padding-bottom: 0.35em;}
h5 { font-size: 120%; padding-bottom: 0.3em;}
h6 { font-size: 100%; padding-bottom: 0.25em;}
article, aside, details, figcaption, figure, footer, header, hgroup, menu, nav, section {
	display: block;
}
body, html { line-height: 1.3; }
ul { list-style: circle; }
ol { list-style: decimal; }
ol>li, ul>li { margin-bottom: 1em;  margin-left: 1em; }
blockquote, q {	quotes: none; }
blockquote:before, blockquote:after,
q:before, q:after {	content: ''; content: none; }
table {
	border-collapse: collapse;
	border-spacing: 0;
}
div.footer {
    margin-top: 3em;
    padding: 1em 0;
    border-top: 3px solid ${COLORS.COCALC_ORANGE};
    font-size: 90%;
    color: ${COLORS.GRAY_M}
}
div.footer a {
    color: ${COLORS.GRAY_M};
    text-decoration: underline;
}
div, p { line-height: 1.3; margin-bottom: 1em; }
hr { margin: 2em 0; border: 0; border-top: 1px solid ${COLORS.COCALC_ORANGE}; }
`;
