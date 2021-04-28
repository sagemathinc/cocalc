import Head from "next/head";
import Link from "next/link";
import SiteName from "components/site-name";

export default function Home() {
  return (
    <div>
      <Head>
        <title>
          <SiteName />
        </title>
        <link rel="icon" href={`${process.env.basePath ?? ""}/favicon.ico`} />
      </Head>

      <main>
        <h1>
          <SiteName full={true} />
        </h1>

        <h2>
          <SiteName />
          ...
        </h2>
        <p>Is your best choice for teaching remote scientific courses!</p>

        <p>
          Will save you weeks of class time troubleshooting software and make
          your TA's more effective.
        </p>

        <h2>Browse</h2>
        <ul>
          <li>
            <Link href="/all/1">
              <a>List of all public documents</a>
            </Link>
          </li>
        </ul>
      </main>
    </div>
  );
}
