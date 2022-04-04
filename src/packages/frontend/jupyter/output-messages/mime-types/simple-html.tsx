import register from "./register";
import HTML from "@cocalc/frontend/components/html-ssr";

const Html = ({ value }) => {
  return (
    <div style={{ margin: "5px 0" }}>
      <HTML value={value} />
    </div>
  );
};

register("text/html", 3, Html);
