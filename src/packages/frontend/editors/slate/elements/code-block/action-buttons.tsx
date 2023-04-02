import CopyButton from "@cocalc/frontend/components/copy-button";
import RunButton from "@cocalc/frontend/components/run-button";

const buttonStyle = { color: "#666", fontSize: "9pt" } as const;

export default function ActionButtons({ value, setOutput, kernel, runRef }) {
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
        <RunButton
          kernel={kernel}
          style={buttonStyle}
          input={value}
          setOutput={setOutput}
          runRef={runRef}
        />
        <CopyButton style={buttonStyle} value={value} />
      </div>
    </div>
  );
}
