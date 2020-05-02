/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// this is purely for manual testing: in ./src/smc-hub$ nodejs test/email.js

// it uses the usual database and hence picks up all the site-settings

require("ts-node").register();
require("coffeescript/register");

const { callback2 } = require("smc-util/async-utils");
const { send_email, welcome_email } = require("../email");
// const {send_email_notification} = require("../mentions/handle")
const { forgot_password } = require("../password");
const message = require("smc-util/message");

const ts = new Date().toISOString();

const body = `<p>Hello!</p><p>TS = ${ts}</p>\n<p>We will use CoCalc for the course <em>small</em>.</p>\n<p>Please sign up!</p>\n<p>--</p>\n<p>Harald Schilly</p>\n\n<br/><br/>\n<b>To accept the invitation:\n<ol>\n<li>Open <a href=\"https://cocalc.com/app\">CoCalc</a></li>\n<li>Sign up/in using <i>exactly</i> your email address <code>harald.schilly+student9191919@gmail.com</code></li>\n<li>Open <a href='https://cocalc.com/projects/35e03677-1408-4776-9eba-0423cc6d7c1e/'>the project 'small'</a>.</li>\n</ol></b>\n<br/><br />\n(If you're already signed in via <i>another</i> email address,\n you have to sign out and sign up/in using the mentioned email address.)\n`;

async function main() {
  const db = require("../postgres").db();
  await callback2(db.connect, {});

  const settings = await callback2(db.get_server_settings_cached, {});
  console.log(`settings = ${JSON.stringify(settings, null, 2)}`);

  const send_res = await callback2(send_email, {
    subject: `Test Subject ${ts}`,
    body: body,
    to: "harald.schilly+student9191919@gmail.com",
    asm_group: 147985,
    settings: settings,
  });
  console.log(`send_email done: ${send_res}`);

  // welcome email
  const welcome_res = await callback2(welcome_email, {
    to: "harald@schil.ly",
    token: "asdf-asdf-asdf",
    only_verify: false, // if verification shows up depends on the settings
    settings: settings,
  });
  console.log(`welcome_email done: ${welcome_res}`);

  // email verification token
  const verify_res = await callback2(welcome_email, {
    to: "harald@schil.ly",
    token: "asdf-asdf-asdf",
    only_verify: true,
    settings: settings,
  });
  console.log(`verify_email done: ${verify_res}`);

  // password reset

  // @mention
  // no real need to test @mention emails, because they use send_email

  const forgot_pw = await callback2(forgot_password, {
    mesg: message.forgot_password({ email_address: "harald@schil.ly" }),
    ip_address: "1.2.3.4",
    database: db,
  });
  console.log(`forgot_password done: ${forgot_pw}`);

  process.exit(0);
}

main();
