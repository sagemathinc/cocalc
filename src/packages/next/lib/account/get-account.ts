// There's a ton of code that imports from this file, so just importing and exporting instead of changing all of that.

// getAccount takes a req and returns the account_id, resolving either the api key or remember_me token.

import getAccount from "@cocalc/server/auth/get-account";
export default getAccount;
