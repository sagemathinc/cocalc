import register from "./register";

register("application/pdf", 6, ({ value }) => {
  if (value == null) {
    console.warn("PDF: value must be specified");
    return <pre>Invalid PDF output</pre>;
  }
  return (
    <embed
      style={{ width: "100%", height: "70vh" }}
      src={`data:application/pdf;base64,${value.get("value")}`}
      type="application/pdf"
    />
  );
});
