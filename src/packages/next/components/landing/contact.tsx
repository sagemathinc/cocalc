/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import A from "components/misc/A";
import { useCustomize } from "lib/customize";

export default function Contact({
  lower,
  showEmail = true,
  useHelpEmail = false,
}: {
  lower?: boolean;
  showEmail?: boolean;
  useHelpEmail?: boolean;
}) {
  const { contactEmail, helpEmail } = useCustomize();

  const email = useHelpEmail ? helpEmail : contactEmail;

  if (!email)
    return <span>{lower ? "c" : "C"}ontact your site administrator</span>;
  return (
    <A href={"mailto:" + email}>
      {lower ? "c" : "C"}ontact {showEmail ? email : ""}
    </A>
  );
}
