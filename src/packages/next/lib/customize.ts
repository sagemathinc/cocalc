/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
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
  noindex?: boolean; // tell search engines to not index that page
}

const CustomizeContext = createContext<Partial<Customize>>({});
const { Provider } = CustomizeContext;
export const useCustomize = () => useContext(CustomizeContext) ?? {};
export { Provider as Customize };
export type { Customize as CustomizeType };
