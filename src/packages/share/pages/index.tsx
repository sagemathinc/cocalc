import Link from "next/link";

export default function Home() {
  return (
    <>
      <h1>Landing page of share server</h1>
      <Link href="/public_paths/page/1">
        <a>Recently shared files</a>
      </Link>
      <br/><br/>
      <Link href="/public_paths/page/1">
        <a>Popular shared files</a>
      </Link>
    </>
  );
}
