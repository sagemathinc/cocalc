import { register } from "./tables";

register({
  name: "shopping-cart-items",
  title: "Shopping",
  icon: "shopping-cart",
  query: {
    crm_shopping_cart_items: [
      {
        id: null,
        account_id: null,
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
