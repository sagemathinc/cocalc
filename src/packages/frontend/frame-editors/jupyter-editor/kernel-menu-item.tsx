import Logo from "@cocalc/frontend/jupyter/logo";
export const SELECTED_STYLE: React.CSSProperties = {
  color: "var(--cocalc-link, rgb(33, 150, 243))",
  fontWeight: "bold",
} as const;
import { KernelStar } from "@cocalc/frontend/components/run-button/kernel-star";

export default function KernelMenuItem({
  display_name,
  metadata,
  name,
  currentKernel,
}) {
  const current = name === currentKernel;
  const priority = metadata?.cocalc?.priority ?? 0;
  const logo = (
    <Logo
      kernel={name}
      size={20}
      style={{
        height: "20px",
        width: "20px",
        marginTop: "-5px",
        marginRight: "20px",
      }}
    />
  );
  return (
    <span style={{ height: "20px", ...(current ? SELECTED_STYLE : undefined) }}>
      {logo}
      {display_name}
      <KernelStar priority={priority} />
    </span>
  );
}