import Link from "next/link";
import { Layout } from "components/share/layout";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import GoogleSearch from "components/share/google-search";

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
          <h2>
            Browse{" "}
            <Link href="/share/public_paths/page/1">
              <a>publicly indexed shared files.</a>
            </Link>
          </h2>

          <h2>Search</h2>
          <GoogleSearch />
        </div>
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps() {
  return await withCustomize();
}
