import { CSSProperties, ReactNode } from "react";

interface Props {
  label: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
}

export default function EditRow({
  label,
  description,
  children,
  style,
}: Props) {
  return (
    <div style={{ marginBottom: "20px", ...style }}>
      <h4>{label}</h4>
      {description == null ? (
        children
      ) : (
        <div style={{ width: "100%" }}>
          {children}
          <div style={{ color: "#666", fontSize: "10pt", marginTop: "10px" }}>
            {description}
          </div>
        </div>
      )}
    </div>
  );
}
