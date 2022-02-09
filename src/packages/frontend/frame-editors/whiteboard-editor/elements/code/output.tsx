export default function Output({ output }) {
  return <pre>{JSON.stringify(output, undefined, 2)}</pre>;
}
