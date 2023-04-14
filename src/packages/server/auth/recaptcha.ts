/*
Verify recaptcha or throw error on failure.

Does nothing if recaptcha is not configured on the server.
*/

import { getServerSettings } from "@cocalc/server/settings/server-settings";

// IMPORTANT: This code is only meant to be used by the nextjs app.  Note that
// nextjs polyfills fetch in: https://nextjs.org/blog/next-9-4#improved-built-in-fetch-support
// Installing node-fetch v3 won't work at all, so don't do that.

declare var fetch;

const THRESH = 0.25;

export default async function reCaptcha(req): Promise<void> {
  const { re_captcha_v3_secret_key } = await getServerSettings();
  if (!re_captcha_v3_secret_key) return;

  const { reCaptchaToken } = req.body;

  if (!reCaptchaToken) {
    throw Error("reCaptcha token must be provided");
  }

  // actually check it -- get the score via post request from google.
  const url = `https://www.google.com/recaptcha/api/siteverify?secret=${re_captcha_v3_secret_key}&response=${reCaptchaToken}&remoteip=${req.socket.remoteAddress}`;
  const response: any = await fetch(url);
  const result = await response.json();

  if (!result.success) {
    throw Error(
      `reCaptcha may be misconfigured. ${JSON.stringify(result["error-codes"])}`
    );
  }
  if (!result.score || result.score < THRESH) {
    throw Error(
      `Only humans are allowed to use this feature. Your score is ${result.score}, which is below the human threshold of ${THRESH}.  Please move your mouse around, type like a human, etc., and try again.`
    );
  }
}
