import PlainCopyButton from "@cocalc/frontend/components/copy-button";
import PlainRunButton from "@cocalc/frontend/components/run-button";

const buttonStyle = { color: "#666", fontSize: "9pt" } as const;

export default function ActionButtons({ value, setOutput, setError }) {
  return (
    <div style={{ position: "relative" }}>
      <div
        style={{
          display: "flex",
          position: "absolute",
          right: 0,
          top: "-3px",
          zIndex: 1,
        }}
      >
        <PlainRunButton
          kernel="python3"
          style={buttonStyle}
          input={value}
          setOutput={setOutput}
          setError={setError}
        />
        <PlainCopyButton style={buttonStyle} value={value} />
      </div>
    </div>
  );
}
