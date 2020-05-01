/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Table } from "./types";

Table({
  name: "account_profiles",
  rules: {
    desc:
      "(Virtual) Table that provides access to the profiles of all users; the profile is their *publicly visible* avatar.",
    virtual: "accounts",
    anonymous: false,
    user_query: {
      get: {
        pg_where: [],
        options: [{ limit: 1 }], // in case user queries for [{account_id:null, profile:null}] they should not get the whole database.
        fields: {
          account_id: null,
          profile: {
            image: undefined,
            color: undefined,
          },
        },
      },
    },
  },
});
