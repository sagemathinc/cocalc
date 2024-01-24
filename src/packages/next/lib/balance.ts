/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { createContext } from "react";

export interface StoreBalance  {
  balance?: number;
  refreshBalance: () => Promise<void>;
}

export const StoreBalanceContext = createContext<StoreBalance>({
  refreshBalance: async () => {},
});
