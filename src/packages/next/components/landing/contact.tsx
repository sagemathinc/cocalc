/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { useCustomize } from "lib/customize";
import A from "components/misc/A";

export default function Contact({
  lower,
  showEmail = true,
}: {
  lower?: boolean;
  showEmail?: boolean;
}) {
  const { contactEmail } = useCustomize();
  if (!contactEmail) return <span>{lower ? "c" : "C"}ontact your site administrator</span>
  return (
    <A href={"mailto:" + contactEmail}>
      {lower ? "c" : "C"}ontact {showEmail && contactEmail }
    </A>
  );
}
