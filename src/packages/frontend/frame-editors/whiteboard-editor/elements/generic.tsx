export default function Generic({ element, focused }) {
  focused = focused;
  const { str, data } = element;
  return (
    <>
      {str != null && str}
      {data != null && <span>{JSON.stringify(data, undefined, 2)}</span>}
    </>
  );
}
