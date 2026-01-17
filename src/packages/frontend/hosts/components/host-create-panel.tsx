import { Button, Layout } from "antd";
import { React } from "@cocalc/frontend/app-framework";
import { IS_MOBILE } from "@cocalc/frontend/feature";
import { Resizable } from "re-resizable";

type HostCreatePanelProps = {
  width: number;
  setWidth: (value: number) => void;
  onHide?: () => void;
  children: React.ReactNode;
};

const PANEL_STYLE: React.CSSProperties = {
  background: "white",
  borderRight: "1px solid #eee",
  padding: "16px",
  height: "100%",
  minHeight: 0,
  overflow: "auto",
  transition: "none",
};

export function HostCreatePanel({
  width,
  setWidth,
  onHide,
  children,
}: HostCreatePanelProps) {
  const minWidth = 250;
  const maxWidth = 640;
  const handleStyles = {
    right: {
      width: "6px",
      right: "-3px",
      cursor: "col-resize",
      background: "transparent",
    },
  } as const;

  const sider = (
    <Layout.Sider width={width} style={PANEL_STYLE} collapsible={false}>
      {onHide && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
          <Button size="small" onClick={onHide}>
            Hide Panel
          </Button>
        </div>
      )}
      {children}
    </Layout.Sider>
  );

  if (IS_MOBILE) {
    return sider;
  }

  return (
    <Resizable
      size={{ width, height: "100%" }}
      enable={{ right: true }}
      minWidth={minWidth}
      maxWidth={maxWidth}
      handleStyles={handleStyles}
      onResizeStop={(_, __, ___, delta) => {
        const next = Math.min(maxWidth, Math.max(minWidth, width + delta.width));
        setWidth(next);
      }}
    >
      {sider}
    </Resizable>
  );
}
