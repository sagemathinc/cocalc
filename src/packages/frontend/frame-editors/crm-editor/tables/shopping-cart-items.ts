import { register } from "./tables";

register({
  name: "shopping-cart-items",
  title: "Shopping Cart Items",
  icon: "shopping-cart",
  query: {
    crm_shopping_cart_items: [
      {
        account_id: null,
        id: null,
        added: null,
        removed: null,
        purchased: null,
        product: null,
        description: null,
        project_id: null,
      },
    ],
  },
});
