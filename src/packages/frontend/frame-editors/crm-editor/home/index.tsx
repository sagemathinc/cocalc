import View from "../views/view";
import { Icon } from "@cocalc/frontend/components";

const STYLE = {
  width: "45%",
  height: "50vh",
  overflow: "auto",
  display: "inline-block",
  margin: "15px 2.5% 15px 2.5%",
};

export default function Home() {
  return (
    <div>
      <h3>
        <Icon name="home" /> Welcome{" "}
      </h3>
      <View
        style={STYLE}
        table="tasks"
        view="grid"
        name="Table of Tasks"
        id="home-tasks"
      />
      <View
        style={STYLE}
        table="people"
        view="gallery"
        name="People"
        id="home-people"
      />
      <View
        style={STYLE}
        table="support-tickets"
        view="grid"
        name="Support Tickets"
        id="home-tickets"
      />
      <View
        style={STYLE}
        table="shopping-cart-items"
        view="gallery"
        name="Shopping Cart Items"
        id="home-shopping"
      />
      <View
        style={{ ...STYLE, width: "95%", margin: "15px 2.5%" }}
        table="accounts"
        view="calendar"
        name="Accounts"
        id="home-accounts"
      />
    </div>
  );
}
