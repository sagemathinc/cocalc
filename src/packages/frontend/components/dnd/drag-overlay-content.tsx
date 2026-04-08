// Generic drag overlay label shown next to the cursor during DnD.
// Used by both file explorer and frame editor for consistent appearance.

import { Icon, type IconName } from "@cocalc/frontend/components/icon";
import { COLORS } from "@cocalc/util/theme";
import { DRAG_OVERLAY_STYLE } from "./config";

type Variant = "valid" | "neutral" | "invalid";

const VARIANT_COLORS: Record<Variant, string> = {
  valid: `${COLORS.ANTD_LINK_BLUE}e0`,
  neutral: `${COLORS.GRAY_D}d0`,
  invalid: "var(--cocalc-error, #f5222de0)",
};

interface Props {
  icon: IconName;
  text: string;
  variant: Variant;
}

export function DragOverlayContent({ icon, text, variant }: Props) {
  return (
    <div
      style={{
        ...DRAG_OVERLAY_STYLE,
        background: VARIANT_COLORS[variant],
        color: COLORS.WHITE,
      }}
    >
      <Icon name={icon} style={{ marginRight: 6 }} />
      {text}
    </div>
  );
}
