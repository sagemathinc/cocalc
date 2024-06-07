export default function CloudFilesystemLog({
  id,
  style,
}: {
  id: number;
  style?;
}) {
  console.log(id);
  return <div style={{ color: "#666", ...style }}>Log</div>;
}
