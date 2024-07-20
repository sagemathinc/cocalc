/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { useRouter } from "next/router";
import { Divider } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import Try from "components/auth/try";

export default function OpenAnonymously({
  publicPathId,
}: {
  publicPathId?: string;
}) {
  const router = useRouter();
  return (
    <div>
      <Divider>
        <Icon name="mask" style={{ marginRight: "10px" }} /> Anonymously
      </Divider>
      <Try
        minimal
        onSuccess={() =>
          router.push({
            pathname: router.asPath.split("?")[0],
            query: { edit: "true" },
          })
        }
        publicPathId={publicPathId}
      />
    </div>
  );
}
