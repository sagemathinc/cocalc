import Text from "./text";

export default function Note({ element, focused }) {
  return (
    <div
      style={{
        color: element.data?.color,
        fontSize: element.data?.fontSize,
        background: element.data?.background ?? "#fff9b2",
        boxShadow: "5px 5px 7px rgb(33 33 33 / 70%)",
        padding: "15px",
        overflowX: "scroll",
        width: "100%",
        height: "100%",
        border: "1px solid lightgrey",
        borderRadius: "5px",
      }}
    >
      <Text element={element} focused={focused} />
    </div>
  );
}
