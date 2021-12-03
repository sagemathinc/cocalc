import Link from "next/link";
import basePath from "lib/base-path";
import { join } from "path";

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
  if (props.external) {
    const props2 = copyWithout(props, new Set(["external"]));
    if (!href.startsWith(basePath)) {
      props2.href = join(basePath, href);
    }
    return <a {...props2} target={"_blank"} rel={"noopener"} />;
  }
  return (
    <Link href={href}>
      <a {...copyWithout(props, new Set(["external", "href"]))} />
    </Link>
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
