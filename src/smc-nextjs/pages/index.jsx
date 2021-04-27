import Head from "next/head";

export default function Home() {
  return (
    <div>
      <Head>
        <title>CoCalc Share Server</title>
        <link rel="icon" href={`${process.env.basePath ?? ""}/favicon.ico`} />
      </Head>

      <main>
        <h1>CoCalc Share Server</h1>
      </main>
    </div>
  );
}
