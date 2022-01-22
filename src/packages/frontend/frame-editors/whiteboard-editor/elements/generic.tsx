export default function Generic({ element, focused }) {
  const { str, data } = element;
  return (
    <>
      {str != null && str}
      {data != null && <span>{JSON.stringify(data, undefined, 2)}</span>}
    </>
  );
}
