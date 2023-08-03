export default function GlobalSpendLimit({ global }) {
  if (global == null) {
    return null;
  }
  const { quota, why, increase } = global;
  return (
    <div>
      Global Spending Limit: {quota}
      <br />
      {why}
      {increase}
    </div>
  );
}
