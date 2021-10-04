import Link from "next/link";

export default function A(props: any) {
  const { href } = props;
  if (href == null) {
    return <a {...props} />;
  }
  if (props.external || href.includes("://") || href.startsWith("mailto:")) {
    return <a {...props} target={"_blank"} rel={"noopener"} />;
  }
  const props2 = {};
  for (const i in props) {
    if (i != "href") {
      props2[i] = props[i];
    }
  }
  return (
    <Link href={href}>
      <a {...props2} />
    </Link>
  );
}
