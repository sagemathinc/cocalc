import register from "../register";

register({
  path: "licenses/buy",
  title: "Buy",
  icon: "shopping-cart",
  desc: "TODO: Buy a License",
  Component: () => {
    return <div>Buy a license.</div>;
  },
});
