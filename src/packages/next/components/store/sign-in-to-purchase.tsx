/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert } from "antd";
import A from "components/misc/A";

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
        Feel free to explore pricing, but you must be <A href="/auth/sign-in" external>signed in</A>
        {" "} with a regular account in order to purchase a license.
      </div>
    );
  }

  return (
    <Alert
      closable
      showIcon
      type="warning"
      message={body()}
      style={{ marginBottom: "20px" }}
    />
  );
};
