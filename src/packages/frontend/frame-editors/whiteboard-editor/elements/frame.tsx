export default function Frame({ element, focused, canvasScale }) {
  focused = focused;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        border: `${(element.data?.width ?? 1) / canvasScale}px solid ${
          element.data?.color ?? "black"
        }`,
      }}
    ></div>
  );
}
