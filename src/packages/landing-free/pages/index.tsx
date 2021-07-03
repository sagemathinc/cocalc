import Head from "next/head";
import Image from "next/image";
import styles from "../styles/Home.module.css";
import { join } from "path";
import { Button } from "antd";
import 'antd/dist/antd.css';

export default function Home() {
  return (
    <div className={styles.container}>
      <Head>
        <title>Open CoCalc -- Collaborative Calculation</title>
        <meta name="description" content="CoCalc" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className={styles.main}>
        todo: main body.
        <Button href={join(process.env.BASE_PATH ?? "/", "static/app.html")}>
          Sign In
        </Button>
      </main>

      <footer className={styles.footer}>todo: footer.</footer>
    </div>
  );
}
