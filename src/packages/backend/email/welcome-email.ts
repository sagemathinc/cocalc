/*
Send a welcome email to a person if they create an account and
we know their email address.

Throws error if email address is not set for this use
in the database or if sending of email is not configured.
*/

import sendEmail from "./send-email";
import getPool from "@cocalc/backend/database";

export default async function sendWelcomeEmail(
  account_id: string
): Promise<void> {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT email_address FROM accounts WHERE account_id=$1",
    [account_id]
  );
  if (rows.length == 0) {
    throw Error("no such account");
  }
  const { email_address } = rows[0];
  if (!email_address) {
    throw Error(
      "user has no email address, so can't send them a welcome email"
    );
  }

  const subject = "Welcome!";
  const text = "Welcome!";
  const html = "Welcome!";

  sendEmail({
    to: email_address,
    subject,
    text,
    html,
  });
}

/*
function welcomeHtml({ token_url, verify_emails, site_name, url }) {
  return `\
<h1>Welcome to ${site_name}</h1>

<p style="margin-top:0;margin-bottom:10px;">
<a href="${url}">${site_name}</a> helps you to work with open-source scientific software in your web browser.
</p>

<p style="margin-top:0;margin-bottom:20px;">
You received this email because an account with your email address was created.
This was either initiated by you, a friend or colleague invited you, or you're
a student as part of a course.
</p>

${verify_emails ? verify_email_html(token_url) : ""}

<hr size="1"/>

<h3>Exploring ${site_name}</h3>
<p style="margin-top:0;margin-bottom:10px;">
In ${site_name} your work happens inside <strong>private projects</strong>.
These are personal workspaces which contain your files, computational worksheets, and data.
You can run your computations through the web interface, via interactive worksheets and notebooks, or by executing a program in a terminal.
${site_name} supports online editing of
    <a href="https://jupyter.org/">Jupyter Notebooks</a>,
    <a href="https://www.sagemath.org/">Sage Worksheets</a>,
    <a href="https://en.wikibooks.org/wiki/LaTeX">Latex files</a>, etc.
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
<li style="margin-top:0;margin-bottom:10px;">Mathematical calculation:
    <a href="https://www.sagemath.org/">SageMath</a>,
    <a href="https://www.sympy.org/">SymPy</a>, etc.
</li>
<li style="margin-top:0;margin-bottom:10px;">Statistics and Data Science:
    <a href="https://www.r-project.org/">R project</a>,
    <a href="http://pandas.pydata.org/">Pandas</a>,
    <a href="http://www.statsmodels.org/">statsmodels</a>,
    <a href="http://scikit-learn.org/">scikit-learn</a>,
    <a href="http://www.nltk.org/">NLTK</a>, etc.
</li>
<li style="margin-top:0;margin-bottom:10px;">Various other computation:
    <a href="https://www.tensorflow.org/">Tensorflow</a>,
    <a href="https://www.gnu.org/software/octave/">Octave</a>,
    <a href="https://julialang.org/">Julia</a>, etc.
</li>
</ul>

<p style="margin-top:0;margin-bottom:20px;">
Visit our <a href="https://cocalc.com/doc/software.html">Software overview page</a> for more details!
</p>


<p style="margin-top:20px;margin-bottom:10px;">
<strong>Questions?</strong>
</p>
<p style="margin-top:0;margin-bottom:10px;">
Schedule a Live Demo with a specialist from CoCalc: <a href="${LIVE_DEMO_REQUEST}">request form</a>.
</p>
<p style="margin-top:0;margin-bottom:20px;">
In case of problems, concerns why you received this email, or other questions please contact:
<a href="mailto:${HELP_EMAIL}">${HELP_EMAIL}</a>.
</p>
\
`;
}
*/
