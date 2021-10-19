import { join } from "path";
import basePath from "lib/base-path";

export default function Index() {
  return <>Testing.</>;
}

export async function getServerSideProps(context) {
  const { res } = context;
  res.writeHead(302, { location: join(basePath, "config/account/name") });
  res.end();
  return { props: {} };
}
