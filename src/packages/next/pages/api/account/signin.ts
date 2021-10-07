/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

export default function signIn(req, res) {
  if (req.method === "POST") {
    const { email, password } = req.body;
    if (password.length < 6) {
      res.json({ error: "password too short", email });
    } else {
      res.json({
        account_id: "10f0e544-313c-4efe-8718-2142ac97ad11",
        email,
      });
    }
    // Process a POST request
  } else {
    res.status(404).json({ message: "Sign In must use a POST request." });
  }
}
