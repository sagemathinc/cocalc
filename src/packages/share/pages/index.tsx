import Link from "next/link";

export default function Home() {
  return (
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
  );
}
