/*
Send a welcome email to a person if they create an account and
we know their email address.

Throws error if email address is not set for this use
in the database or if sending of email is not configured.
*/

import sendEmail from "./send-email";
import { getServerSettings } from "@cocalc/backend/server-settings";
import { LIVE_DEMO_REQUEST } from "@cocalc/util/theme";
import { getVerifyEmail } from "./verify";
import { is_valid_email_address as isValidEmailAddress } from "@cocalc/util/misc";
import siteURL from "@cocalc/backend/server-settings/site-url";

export default async function sendWelcomeEmail(
  email_address: string
): Promise<void> {
  if (!isValidEmailAddress(email_address)) {
    throw Error("invalid email address");
  }

  const { text, html } = await getWelcomeEmail(email_address);

  await sendEmail({
    to: email_address,
    subject: "Welcome!",
    text,
    html,
  });
}

async function getWelcomeEmail(
  email_address: string
): Promise<{ text: string; html: string }> {
  const verify = await getVerifyEmail(email_address);
  const { help_email, site_name } = await getServerSettings();

  const site_url = await siteURL();
  const html = `\
<h1>Welcome to ${site_name}</h1>

<p style="margin-top:0;margin-bottom:10px;">
<a href="${site_url}">${site_name}</a> helps you to work with open-source scientific software in your web browser.
</p>

<p style="margin-top:0;margin-bottom:20px;">
You received this email because an account with your email address was created.
</p>

${verify.html}

<hr size="1"/>

<h3>Exploring ${site_name}</h3>
<p style="margin-top:0;margin-bottom:10px;">
In ${site_name} your work happens inside <strong>private projects</strong>.
These are personal workspaces which contain your files, computational worksheets, and data.
You can run your computations through the web interface, via interactive worksheets
and notebooks, or by executing a program in a terminal. ${site_name} supports
online editing of
    <a href="https://cocalc.com/features/jupyter-notebook">Jupyter Notebooks</a>,
    <a href="https://cocalc.com/features/sage">Sage Worksheets</a>,
    <a href="https://cocalc.com/features/latex-editor">LaTeX files</a>, etc.
</p>

<p style="margin-top:0;margin-bottom:10px;">
<strong>How to get from 0 to 100:</strong>
</p>

<ul>
<li style="margin-top:0;margin-bottom:10px;">
    <strong><a href="https://doc.cocalc.com/">CoCalc Manual:</a></strong> learn more about CoCalc's features.
</li>
<li style="margin-top:0;margin-bottom:10px;">
    <a href="https://doc.cocalc.com/jupyter.html">Working with Jupyter Notebooks</a>
</li>
<li style="margin-top:0;margin-bottom:10px;">
    <a href="https://doc.cocalc.com/sagews.html">Working with SageMath Worksheets</a>
</li>
<li style="margin-top:0;margin-bottom:10px;">
    <strong><a href="https://cocalc.com/policies/pricing.html">Subscriptions:</a></strong> make hosting more robust and increase project quotas
</li>
<li style="margin-top:0;margin-bottom:10px;">
    <a href="https://doc.cocalc.com/teaching-instructors.html">Teaching a course on CoCalc</a>.
</li>
<li style="margin-top:0;margin-bottom:10px;">
    <a href="https://doc.cocalc.com/howto/connectivity-issues.html">Troubleshooting connectivity issues</a>
</li>
<li style="margin-top:0;margin-bottom:10px;">
    <a href="https://github.com/sagemathinc/cocalc/wiki/MathematicalSyntaxErrors">Common mathematical syntax errors:</a> look into this if you are new to working with a programming language!
</li>
</ul>


<p style="margin-top:0;margin-bottom:20px;">
<strong>Collaboration:</strong>
You can invite collaborators to work with you inside a project.
Like you, they can edit the files in that project.
Edits are visible in <strong>real time</strong> for everyone online.
You can share your thoughts in a <strong>side chat</strong> next to each document.
</p>


<p><strong>Software:</strong>
<ul>
<li style="margin-top:0;margin-bottom:10px;">Mathematical Calculation:
    <a href="https://www.sagemath.org/">SageMath</a>,
    <a href="https://www.sympy.org/">SymPy</a>, etc.
</li>
<li style="margin-top:0;margin-bottom:10px;">Statistics and Data Science:
    <a href="https://www.r-project.org/">R project</a>,
    <a href="http://pandas.pydata.org/">Pandas</a>,
    <a href="http://www.statsmodels.org/">statsmodels</a>,
    <a href="http://scikit-learn.org/">scikit-learn</a>,
    <a href="http://www.nltk.org/">NLTK</a>, and <a href="https://cocalc.com/software">much more</a>.
</li>
<li style="margin-top:0;margin-bottom:10px;">Various other Computation:
    <a href="https://www.tensorflow.org/">Tensorflow</a>,
    <a href="https://cocalc.com/features/octave">Octave</a>,
    <a href="https://cocalc.com/features/julia">Julia</a>, etc.
</li>
</ul>

<p style="margin-top:0;margin-bottom:20px;">
Visit our <a href="https://cocalc.com/features">Feature Overview Page</a> for more details!
</p>


<p style="margin-top:20px;margin-bottom:10px;">
<strong>Questions?</strong>
</p>
<p style="margin-top:0;margin-bottom:10px;">
Schedule a Live Demo with a specialist from CoCalc.com: <a href="${LIVE_DEMO_REQUEST}">request form</a>.
</p>
<p style="margin-top:0;margin-bottom:20px;">
In case of problems, concerns why you received this email, or other questions please contact:
<a href="mailto:${help_email}">${help_email}</a>.
</p>
\
`;

  const text = `
Welcome to ${site_name}!

${site_name} helps you to work with open-source scientific software in your web browser.

${site_url}

You received this email because an account with your email address was created.

${verify.text}

EXPLORING ${site_name}

In ${site_name} your work happens inside private projects.  These are personal
workspaces which contain your files, computational worksheets, and data.
You can run your computations through the web interface, via interactive worksheets
and notebooks, or by executing a program in a terminal. ${site_name} supports
online editing of Jupyter Notebooks, Sage Worksheets, LaTeX files, and much more.

HOW TO GET FROM 0 to 100:

CoCalc Manual: https://doc.cocalc.com/

Working with Jupyter Notebooks: https://doc.cocalc.com/jupyter.html

Working with SageMath Worksheets: https://doc.cocalc.com/sagews.html

Subscriptions: https://cocalc.com/policies/pricing.html

Teaching a course on CoCalc: https://doc.cocalc.com/teaching-instructors.html

Troubleshooting connectivity issues: https://doc.cocalc.com/howto/connectivity-issues.html

Common mathematical syntax errors: https://github.com/sagemathinc/cocalc/wiki/MathematicalSyntaxErrors

COLLABORATION

You can invite collaborators to work with you inside a project.
Like you, they can edit the files in that project.
Edits are visible in real time for everyone online.
You can share your thoughts in a side chat next to each document.

SOFTWARE

- Mathematical Calculation: https://www.sagemath.org, https://www.sympy.org, etc.

- Statistics and Data Science: https://www.r-project.org/, http://pandas.pydata.org/,
http://www.statsmodels.org/, http://scikit-learn.org/, http://www.nltk.org/, and
much more.  See https://cocalc.com/software

Various other Computation: https://www.tensorflow.org/, https://cocalc.com/features/octave,
https://cocalc.com/features/julia

Visit our Feature Overview Page at https://cocalc.com/features for more details!

QUESTIONS?

Schedule a Live Demo with a specialist from CoCalc.com:

${LIVE_DEMO_REQUEST}

In case of problems, concerns why you received this email, or other questions
please contact ${help_email}
`;
  return { html, text };
}
