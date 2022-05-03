import register from "./register";
import HTML from "@cocalc/frontend/components/html-ssr";

const Html = ({ value }: { value: string }) => {
  return (
    <div style={{ margin: "5px 0" }}>
      <HTML value={value} />
    </div>
  );
};

// HTML should definitely have higher priority than
// LaTeX.  For example, Julia tables are output as both
// **completely broken** text/latex that everybody ignores,
// and as text/html that looks good.
register("text/html", 5, Html);

// put latex as HTML, since jupyter requires $'s anyways:
register("text/latex", 3, Html);
