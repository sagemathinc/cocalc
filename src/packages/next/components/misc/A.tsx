import Link from "next/link";
import { join } from "path";
import { ReactNode } from "react";

import basePath from "lib/base-path";

interface Props {
  href?: string;
  external?: boolean;
  nofollow?: boolean;
  title?: string;
  children?: ReactNode;
}

export default function A(props: Props) {
  const { href, external = false, nofollow = false } = props;

  if (href == null) {
    return <a {...copyWithout(props, new Set(["external"]))} />;
  }

  const rel = `noopener ${nofollow ? "nofollow" : ""}`;

  if (href.includes("://") || href.startsWith("mailto:")) {
    return (
      <a
        {...copyWithout(props, new Set(["external", "nofollow"]))}
        target={"_blank"}
        rel={rel}
      />
    );
  }

  if (external) {
    const props2 = copyWithout(props, new Set(["external", "nofollow"]));
    if (!href.startsWith(basePath)) {
      // @ts-ignore
      props2.href = join(basePath, href);
    }
    return <a {...props2} target={"_blank"} rel={rel} />;
  }

  return (
    <Link
      href={href}
      {...copyWithout(props, new Set(["external", "nofollow", "href"]))}
    />
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
