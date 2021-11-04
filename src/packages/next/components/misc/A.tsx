import Link from "next/link";

export default function A(props: any) {
  const { href } = props;
  if (href == null) {
    return <a {...copyWithout(props, "external")} />;
  }
  if (props.external || href.includes("://") || href.startsWith("mailto:")) {
    return (
      <a
        {...copyWithout(props, "external")}
        target={"_blank"}
        rel={"noopener"}
      />
    );
  }
  return (
    <Link href={href}>
      <a {...copyWithout(props, "href")} />
    </Link>
  );
}

function copyWithout(props, without: string) {
  const props2 = {};
  for (const key in props) {
    if (key != without) {
      props2[key] = props[key];
    }
  }
  return props2;
}
