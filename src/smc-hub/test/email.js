// this is purely for manual testing: in ./src/smc-hub$ nodejs test/email.js

require("ts-node").register();
require("coffeescript/register");

import { send_email } from "../email";

function cb(err) {
  console.log(`cb done: err=${err}`);
}

const ts = new Date().toISOString();

const body = `<p>Hello!</p><p>TS = ${ts}</p>\n<p>We will use CoCalc for the course <em>small</em>.</p>\n<p>Please sign up!</p>\n<p>--</p>\n<p>Harald Schilly</p>\n\n<br/><br/>\n<b>To accept the invitation:\n<ol>\n<li>Open <a href=\"https://cocalc.com/app\">CoCalc</a></li>\n<li>Sign up/in using <i>exactly</i> your email address <code>harald.schilly+student9191919@gmail.com</code></li>\n<li>Open <a href='https://cocalc.com/projects/35e03677-1408-4776-9eba-0423cc6d7c1e/'>the project 'small'</a>.</li>\n</ol></b>\n<br/><br />\n(If you're already signed in via <i>another</i> email address,\n you have to sign out and sign up/in using the mentioned email address.)\n`;

send_email({
  subject: `Test Subject ${ts}`,
  body: body,
  to: "harald.schilly+student9191919@gmail.com",
  asm_group: 147985,
  settings: {},
  cb: cb
});
