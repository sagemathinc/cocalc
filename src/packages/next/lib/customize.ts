/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { createContext, useContext } from "react";

import type { Customize as ServerCustomize } from "@cocalc/database/settings/customize";

interface EnabledPageBranch {
  [key: string]: boolean | undefined | EnabledPageBranch;
}

interface EnabledPageTree extends EnabledPageBranch {
  about: {
    index: boolean | undefined;
    events: boolean | undefined;
    team: boolean | undefined;
  };
  compute: boolean | undefined;
  contact: boolean | undefined;
  features: boolean | undefined;
  info: boolean | undefined;
  legal: boolean | undefined;
  licenses: boolean | undefined;
  news: boolean | undefined;
  onPrem: boolean | undefined;
  organization: boolean | undefined;
  policies: {
    index: boolean | undefined;
    imprint: boolean | undefined;
  };
  pricing: boolean | undefined;
  share: boolean | undefined;
  software: boolean | undefined;
  store: boolean | undefined;
  support: boolean | undefined;
  systemActivity: boolean | undefined;
  status: boolean | undefined;
  termsOfService: boolean | undefined;
  liveDemo: boolean | undefined;
}

interface Customize extends ServerCustomize {
  account?: {
    account_id: string;
    email_address?: string;
    first_name?: string;
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
  serverTime?: number; // the time on the server, in milliseconds since the epoch
  openaiEnabled?: boolean; // backend is configured to provide openai integration.
  googleVertexaiEnabled?: boolean; // if enabled, e.g. Google Gemini is available
  computeServersEnabled?: boolean; // backend configured to run on external compute servers
  enabledPages?: EnabledPageTree; // tree structure which specifies supported routes for this install
  support?: string; // HTML/MD to replace the generic support pages
  supportVideoCall?: string;
}

const CustomizeContext = createContext<Partial<Customize>>({});
const { Provider } = CustomizeContext;
export const useCustomize = () => useContext(CustomizeContext) ?? {};
export { Provider as Customize };
export type { Customize as CustomizeType };
