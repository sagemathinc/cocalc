import Head from "next/head";
import Image from "next/image";
import styles from "../styles/Home.module.css";
import { join } from "path";
import { Button } from "antd";
import "antd/dist/antd.css";

/*
        <Button href={join(process.env.BASE_PATH ?? "/", "static/app.html")}>
          Sign In
        </Button>

*/

// The favicon.ico should be this, but it doesn't work
// when there a base path.  This will cause a problem, e.g, for
// a server with a basePath that isn't running from cocalc.com.
// TODO: why?  Fix this.  No clue...
//const FAVICON = process.env.BASE_PATH +"/webapp/favicon.ico";
const FAVICON = "/webapp/favicon.ico";

export default function Home() {
  return (
    <div className={styles.container}>
      <Head>
        <title>Open CoCalc -- Collaborative Calculation</title>
        <meta name="description" content="CoCalc" />
        <link rel="icon" href={FAVICON} />
      </Head>

      <main className={styles.main}>todo: main body.</main>

      <footer className={styles.footer}>todo: FOOTER</footer>
    </div>
  );
}
