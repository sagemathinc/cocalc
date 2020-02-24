import { create } from "./types";

export const account_profiles = create({
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
            color: undefined
          }
        }
      }
    }
  }
});
