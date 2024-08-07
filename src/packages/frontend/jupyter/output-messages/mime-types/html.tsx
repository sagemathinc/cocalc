import register from "./register";
//import HTML from "@cocalc/frontend/components/html-ssr";
import ImmortalDomNode from "../immortal-dom-node";

const Html = ({
  value,
  id,
  index,
}: {
  value: string;
  id?: string;
  index?: number;
}) => {
  //      <HTML value={value} />
  console.log("HTML", { id, index });
  return (
    <div style={{ margin: "5px 0" }}>
      <ImmortalDomNode html={value} docId={`${id}-${index}`} />
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
