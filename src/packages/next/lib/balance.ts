/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { createContext } from "react";

export interface StoreBalance  {
  balance?: number;
  refreshBalance: () => Promise<void>;
  loading?: boolean;
}

export const StoreBalanceContext = createContext<StoreBalance>({
  refreshBalance: async () => {},
});
