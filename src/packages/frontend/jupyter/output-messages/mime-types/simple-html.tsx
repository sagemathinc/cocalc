import register from "./register";
import HTML from "@cocalc/frontend/components/html-ssr";

const Html = ({ value }) => {
  return (
    <div style={{ margin: "5px 0" }}>
      <HTML value={value} />
    </div>
  );
};

const Math = ({ value }) => {
  value = value.replace("\\newcommand{\\Bold}[1]{\\mathbf{#1}}", ""); // hack for sage kernel for now.
  return <HTML value={value} />;
};

register("text/html", 3, Html);

// put latex as HTML, since jupyter requires $'s anyways:
register("text/latex", 5, Math);
