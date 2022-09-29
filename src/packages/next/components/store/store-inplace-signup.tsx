/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import InPlaceSignInOrUp from "components/auth/in-place-sign-in-or-up";
import { useRouter } from "next/router";

export const StoreInplaceSignInOrUp = () => {
  const router = useRouter();

  return (
    <InPlaceSignInOrUp
      title="Account Configuration"
      why="to shop in the store"
      onSuccess={() => {
        router.reload();
      }}
    />
  );
};
