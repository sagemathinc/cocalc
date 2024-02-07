/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Alert } from "antd";
import { StoreInplaceSignInOrUp } from "./store-inplace-signup";

interface SignInToPurchaseProps {
  noAccount?: boolean;
}

export const SignInToPurchase: React.FC<SignInToPurchaseProps> = (
  props: SignInToPurchaseProps
) => {
  const { noAccount = false } = props;

  if (!noAccount) return null;

  function body() {
    return (
      <div>
        Feel free to explore pricing, but you have to be signed in with a
        regular account in order to be able to purchase a license.
      </div>
    );
  }

  return (
    <Alert
      closable
      showIcon
      type="warning"
      message={body()}
      description={<StoreInplaceSignInOrUp />}
      style={{ marginBottom: "20px" }}
    />
  );
};
