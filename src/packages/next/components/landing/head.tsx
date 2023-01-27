/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import NextHead from "next/head";
import { join } from "path";
import { ReactNode } from "react";

import basePath from "lib/base-path";
import { useCustomize } from "lib/customize";
import IconLogo from "public/logo/icon.svg";

interface Props {
  title: ReactNode;
}

export default function Head({ title }: Props) {
  const { siteName, logoSquareURL } = useCustomize();

  const faviconURL = logoSquareURL
    ? logoSquareURL
    : join(basePath ?? "", IconLogo.src);

  return (
    <NextHead>
      <title>{`${siteName} ${siteName ? "–" : ""} ${title}`}</title>
      <meta
        name="description"
        content="CoCalc landing pages and documentation"
      />
      <link rel="icon" href={faviconURL} />;
    </NextHead>
  );
}
