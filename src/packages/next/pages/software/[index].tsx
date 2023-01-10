/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { SOFTWARE_ENV_DEFAULT } from "lib/landing/consts";
import { LANGUAGE_NAMES } from "lib/landing/consts";

const INDEX_PAGES = LANGUAGE_NAMES.map((l) => l.toLowerCase()).concat(
  "executables"
) as readonly string[];

export default function SoftwareIndex() {
  return <></>;
}

export async function getServerSideProps(context) {
  const { index } = context.params;
  if (!INDEX_PAGES.includes(index)) {
    return { notFound: true };
  } else {
    // permanent redirect, since this page is deprecated and the default software env version should be used
    return context.res.redirect(
      308,
      `/software/${index}/${SOFTWARE_ENV_DEFAULT}`
    );
  }
}
