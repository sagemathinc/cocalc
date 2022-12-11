import Accounts from "./accounts";
import Organizations from "./organizations";
import People from "./people";
import Shopping from "./shopping-cart-items";

const height = "300px";
export default function Dashboard({}) {
  return (
    <div style={{ height: "100%", overflow: "auto" }}>
      <Accounts height={height} />
      <People height={height} />
      <Organizations view="cards" height={height} />
      <Shopping view="cards" height={height} />
    </div>
  );
}
