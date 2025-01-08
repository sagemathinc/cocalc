/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import Link from "next/link";
import { join } from "path";

import basePath from "lib/base-path";

export default function A(props: any) {
  const { href } = props;
  if (href == null) {
    return <a {...copyWithout(props, new Set(["external"]))} />;
  }
  if (href.includes("://") || href.startsWith("mailto:")) {
    return (
      <a
        {...copyWithout(props, new Set(["external"]))}
        target={"_blank"}
        rel={"noopener"}
      />
    );
  }
  if (
    props.external ||
    href.startsWith("/projects") ||
    href.startsWith("/settings")
  ) {
    const props2 = copyWithout(props, new Set(["external"]));
    if (!href.startsWith(basePath)) {
      // @ts-ignore
      props2.href = join(basePath, href);
    }
    return <a {...props2} target={"_blank"} rel={"noopener"} />;
  }
  return (
    <Link href={href} {...copyWithout(props, new Set(["external", "href"]))} />
  );
}

function copyWithout(props, without: Set<string>) {
  const props2 = {};
  for (const key in props) {
    if (!without.has(key)) {
      props2[key] = props[key];
    }
  }
  return props2;
}
