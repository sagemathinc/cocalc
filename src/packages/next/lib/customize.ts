/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { createContext, useContext } from "react";
import type { Customize as ServerCustomize } from "@cocalc/server/settings/customize";

interface Customize extends ServerCustomize {
  account?: {
    account_id: string;
    first_name?: string;
    last_name?: string;
    email_address?: string;
    name?: string;
  };
  isCollaborator?: boolean; // if account_id and project_id are in the props then this gets filled in
  isAuthenticated?: boolean; // if true, the user has a valid authentication cookie
  onCoCalcCom?: boolean; // true, if kucalc server settings flag is set to yes (i.e. for cocalc.com only!)
  noindex?: boolean; // tell search engines to not index that page
  imprint?: string; // HTML/MD for an imprint page
  policies?: string; // HTML/MD for a policy page
  imprintOrPolicies?: boolean; // is true if either of the above is more than an empty string
}

const CustomizeContext = createContext<Partial<Customize>>({});
const { Provider } = CustomizeContext;
export const useCustomize = () => useContext(CustomizeContext) ?? {};
export { Provider as Customize };
export type { Customize as CustomizeType };
