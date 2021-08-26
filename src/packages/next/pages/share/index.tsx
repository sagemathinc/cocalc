import Link from "next/link";
import { Layout } from "components/share/layout";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";

export default function Home({ customize }) {
  return (
    <Customize value={customize}>
      <Layout>
        <div
          style={{
            margin: "30px 0",
            border: "1px solid lightgrey",
            padding: "30px",
            borderRadius: "5px",
          }}
        >
          <h1>Published Files</h1>
          <br />
          Browse{" "}
          <Link href="/public_paths/page/1">
            <a>publicly indexed shared files.</a>
          </Link>
        </div>
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps() {
  return await withCustomize();
}
