import { ReactNode } from "react";
import { Divider } from "antd";

interface Props {
  label: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}

export default function EditRow({ label, description, children }: Props) {
  return (
    <div>
      <Divider orientation="left">{label}</Divider>
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
