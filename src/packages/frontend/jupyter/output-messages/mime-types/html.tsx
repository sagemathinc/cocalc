import register from "./register";
import HTML from "@cocalc/frontend/components/html-ssr";

const Html = ({ value }: { value: string }) => {
  return (
    <div style={{ margin: "5px 0" }}>
      <HTML value={value} />
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
