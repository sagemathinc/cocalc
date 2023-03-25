import PlainCopyButton from "@cocalc/frontend/components/copy-button";

export default function CopyButton({ value }) {
  return (
    <div style={{ position: "relative" }}>
      <PlainCopyButton
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          zIndex: 1,
          color: "#666",
          fontSize: "11px",
        }}
        value={value}
      />
    </div>
  );
}
