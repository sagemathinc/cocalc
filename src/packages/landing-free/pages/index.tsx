import Head from "next/head";
import Image from "next/image";
import styles from "../styles/Home.module.css";
import { Button } from "antd";
import "antd/dist/antd.css";
import Footer from "components/landing/footer";
import Header from "components/landing/header";
import customize from "lib/customize";
import SquareLogo from "components/landing/logo-square";
import A from "components/misc/A";

// The favicon.ico should be this, but it doesn't work
// when there a base path.  This will cause a problem, e.g, for
// a server with a basePath that isn't running from cocalc.com.
// TODO: why?  Fix this.  No clue...
//const FAVICON = join(basePath, "webapp/favicon.ico");
const FAVICON = "/webapp/favicon.ico";

export default function Home() {
  const {
    basePath,
    organizationName,
    organizationURL,
    siteDescription,
    siteName,
    splashImage,
  } = customize;

  return (
    <div className={styles.container}>
      <Head>
        <title>{siteName} -- Collaborative Calculation</title>
        <meta name="description" content="CoCalc" />
        <link rel="icon" href={FAVICON} />
      </Head>
      <main className={styles.main}>
        <Header />
        <div style={{ width: "100%", display: "flex" }}>
          <div style={{ width: "50%", textAlign: "center" }}>
            <SquareLogo style={{ width: "200px" }} />
            <br />
            <h2>{siteName}</h2>
            <h3>{siteDescription}</h3>
            An instance of <A href="https://cocalc.com">CoCalc</A>, hosted by{" "}
            <A href={organizationURL}>{organizationName}</A>.
          </div>
          {splashImage && <img src={splashImage} style={{ width: "50%" }} />}
        </div>
      </main>
      <div style={{ height: "15px" }}></div>
      <Footer />
    </div>
  );
}
