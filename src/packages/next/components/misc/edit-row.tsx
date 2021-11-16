import { ReactNode } from "react";

interface Props {
  label: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}

export default function EditRow({ label, description, children }: Props) {
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
        <b>{label}</b>
      </div>
      {description == null ? (
        children
      ) : (
        <div style={{ width: "100%" }}>
          {" "}
          <div style={{ color: "#666", fontSize: "10pt", marginBottom:'5px' }}>{description}</div>
          {children}
        </div>
      )}
    </div>
  );
}
