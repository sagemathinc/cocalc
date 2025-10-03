/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
API endpoint for checking password strength during sign-up.
Provides real-time feedback without requiring the large zxcvbn library on the client.

Usage:
POST /api/v2/auth/password-strength
Body: { password: "user-password" }

Response:
Success: { score: 0-4, help?: "suggestion text" }
Error: { error: "error message" }
*/

import passwordStrength from "@cocalc/server/auth/password-strength";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@cocalc/util/auth";
import { apiRoute, apiRouteOperation } from "lib/api";
import getParams from "lib/api/get-params";
import { z } from "zod";

const PasswordStrengthInputSchema = z.object({
  password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
});

const PasswordStrengthOutputSchema = z.object({
  score: z.number().min(0).max(4),
  help: z.string().optional(),
});

export async function checkPasswordStrength(req, res) {
  try {
    const { password } = getParams(req);

    if (!password || typeof password !== "string") {
      res.status(400).json({ error: "Password is required" });
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      res.status(400).json({
        error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`,
      });
      return;
    }

    if (password.length > MAX_PASSWORD_LENGTH) {
      res.status(400).json({
        error: `Password must be at most ${MAX_PASSWORD_LENGTH} characters long`,
      });
      return;
    }

    const result = passwordStrength(password);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export default apiRoute({
  checkPasswordStrength: apiRouteOperation({
    method: "POST",
    openApiOperation: {
      tags: ["Auth"],
    },
  })
    .input({
      contentType: "application/json",
      body: PasswordStrengthInputSchema,
    })
    .outputs([
      {
        status: 200,
        contentType: "application/json",
        body: PasswordStrengthOutputSchema,
      },
    ])
    .handler(checkPasswordStrength),
});
