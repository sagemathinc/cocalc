import Text from "./text";

export default function Note({ element, focused }) {
  return (
    <div
      style={{
        background: element.color ?? "#fff9b2",
        boxShadow: "5px 5px 7px rgb(33 33 33 / 70%)",
        padding: "10px",
      }}
    >
      <Text element={element} focused={focused} />
    </div>
  );
}
