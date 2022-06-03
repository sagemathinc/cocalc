export const VERSION_STYLE: React.CSSProperties = {
  maxHeight: "8em",
  backgroundColor: "rgba(150, 150, 150, 0.1)",
  fontSize: "12px",
  padding: "10px",
} as const;

export const VERSION_STYLE_PARENT: React.CSSProperties = {
  clear: "both",
} as const;

export default function SoftwareInfo({ info }: { info: string }) {
  return (
    <div style={VERSION_STYLE_PARENT}>
      <p>Version information:</p>
      <pre style={VERSION_STYLE}>{info}</pre>
    </div>
  );
}
