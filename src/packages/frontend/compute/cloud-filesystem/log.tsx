export default function CloudFilesystemLog({
  style,
}: {
  id: number;
  style?;
}) {
  return <div style={{ color: "var(--cocalc-text-secondary, #666)", ...style }}>Log</div>;
}
