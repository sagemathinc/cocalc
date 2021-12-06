import register from "../register";

register({
  path: "purchases/payment",
  title: "Credit Cards, etc.",
  icon: "credit-card",
  desc: "TODO: Credit cards and other ways of paying",
  Component: () => {
    return <div>TODO: payment methods</div>;
  },
});
