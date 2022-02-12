export default function Frame({ element, focused, canvasScale }) {
  focused = focused;
  return (
    <div
      style={{
        ...element.style,
        width: "100%",
        height: "100%",
        border: `${((element.data?.radius ?? 1) * 2) / canvasScale}px solid ${
          element.data?.color ?? "#252937"
        }`,
        borderRadius: "3px",
        boxShadow: "1px 3px 5px #ccc",
      }}
    ></div>
  );
}
