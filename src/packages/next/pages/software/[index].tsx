/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { SOFTWARE_ENV_DEFAULT } from "lib/landing/consts";

const INDEX_PAGES = ["executables", "python", "r", "julia", "octave"] as const;

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
