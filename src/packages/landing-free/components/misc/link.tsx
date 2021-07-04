import NextLink from "next/link";

export default function Link(props) {
  const href = props["href"];
  if (href?.startsWith("/")) {
    return <NextLink {...props} />;
  } else {
    return <a {...props} target={"_blank"} rel={"noopener"} />;
  }
}
