/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import InPlaceSignInOrUp from "components/auth/in-place-sign-in-or-up";
import { useRouter } from "next/router";

export const StoreInplaceSignInOrUp = () => {
  const router = useRouter();

  return (
    <InPlaceSignInOrUp
      title="Store"
      why="to make store purchases"
      onSuccess={() => {
        router.reload();
      }}
    />
  );
};
