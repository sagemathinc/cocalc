export default function EditRow({ label, children }) {
  return (
    <div style={{ display: "flex", marginTop: "15px" }}>
      <div
        style={{
          width: "20%",
          minWidth: "12ex",
          color: "#555",
          paddingRight: "15px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}
