/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { createContext, useContext } from "react";
import type { Customize as ServerCustomize } from "@cocalc/server/settings/customize";

interface Customize extends ServerCustomize {
  account?: {
    account_id: string;
    email_address?: string;
    first_name?: string;
    is_anonymous?: boolean;
    last_name?: string;
    name?: string;
  };
  defaultComputeImage?: string; // default compute image, e.g. used when creating new projects from a share
  githubProjectId?: string; // proxy github urls
  imprint?: string; // HTML/MD for an imprint page
  imprintOrPolicies?: boolean; // is true if either of the above is more than an empty string
  isAuthenticated?: boolean; // if true, the user has a valid authentication cookie
  isCollaborator?: boolean; // if account_id and project_id are in the props then this gets filled in
  noindex?: boolean; // tell search engines to not index that page
  onCoCalcCom?: boolean; // true, if kucalc server settings flag is set to yes (i.e. for cocalc.com only!)
  policies?: string; // HTML/MD for a policy page
  sandboxProjectId?: string; // a sandbox project to put on landing pages...
  serverTime?: number; // the time on the server, in milliseconds since the epoch
  openaiEnabled?: boolean; // backend is configured to provide openai integration.
}

const CustomizeContext = createContext<Partial<Customize>>({});
const { Provider } = CustomizeContext;
export const useCustomize = () => useContext(CustomizeContext) ?? {};
export { Provider as Customize };
export type { Customize as CustomizeType };
