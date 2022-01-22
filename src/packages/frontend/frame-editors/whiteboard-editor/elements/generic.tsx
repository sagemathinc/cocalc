export default function Generic({ element, focused }) {
  const { str, data } = element;
  return (
    <div style={focused ? { border: "1px solid red" } : undefined}>
      {str != null && str}
      {data != null && <span>{JSON.stringify(data, undefined, 2)}</span>}
    </div>
  );
}
