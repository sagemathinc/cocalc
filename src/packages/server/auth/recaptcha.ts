/*
Verify recaptcha or throw error on failure.

Does nothing if recaptcha is not configured on the server.
*/

import { getServerSettings } from "@cocalc/server/settings/server-settings";
import fetch from "node-fetch";

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
  if (!result.score || result.score < 0.5) {
    throw Error(
      "Only humans are allowed to use this feature.  Please try again."
    );
  }
}
