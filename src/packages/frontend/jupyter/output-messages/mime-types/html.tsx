import register from "./register";
import HTML from "@cocalc/frontend/components/html-ssr";
import StableUnsafeHtml from "../stable-unsafe-html";

const Html = ({
  value,
  id,
  index,
  trust,
}: {
  value: string;
  id?: string;
  index?: number;
  trust?: boolean;
}) => {
  if (!trust) {
    <HTML value={value} />;
  }
  return (
    <div style={{ margin: "5px 0" }}>
      <StableUnsafeHtml html={value} docId={`${id}-${index}`} />
    </div>
  );
};

export default Html;

// HTML should definitely have higher priority than
// LaTeX.  For example, Julia tables are output as both
// **backend only** text/latex and as text/html
// that looks good and is meant to be rendered on the frontend.
// See https://github.com/sagemathinc/cocalc/issues/5925
register("text/html", 5, Html);
