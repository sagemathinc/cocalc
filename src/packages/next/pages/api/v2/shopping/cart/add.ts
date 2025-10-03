/*
Add item to the shopping cart for signed in user.

request body:

- product and description: to add something new to the cart
or
- id: to move something back into the cart that was removed
*/


import addToCart, {
  buyItAgain,
  putBackInCart,
} from "@cocalc/server/shopping/cart/add";
import throttle from "@cocalc/util/api/throttle";
import getAccountId from "lib/account/get-account";
import { apiRoute, apiRouteOperation } from "lib/api";
import getParams from "lib/api/get-params";
import {
  ShoppingCartAddInputSchema,
  ShoppingCartAddOutputSchema,
} from "lib/api/schema/shopping/cart/add";

async function handle(req, res) {
  try {
    res.json(await add(req));
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function add(req): Promise<number | undefined> {
  const account_id = await getAccountId(req);
  if (account_id == null) {
    throw Error("must be signed in to use shopping cart");
  }
  throttle({
    account_id,
    endpoint: "shopping/cart/add",
  });
  const { product, description, id, purchased, project_id } = getParams(req);
  if (id != null) {
    if (purchased) {
      // put copy of it in the cart
      return await buyItAgain(account_id, id);
    } else {
      // adding something back to cart that was saved for later
      return await putBackInCart(account_id, id);
    }
  }
  if (!product) {
    throw Error("if id isn't specified then the product must be set");
  }
  return await addToCart(account_id, product, description, project_id);
}

export default apiRoute({
  addCartItem: apiRouteOperation({
    method: "POST",
    openApiOperation: {
      tags: ["Shopping"],
    },
  })
    .input({
      contentType: "application/json",
      body: ShoppingCartAddInputSchema,
    })
    .outputs([
      {
        status: 200,
        contentType: "application/json",
        body: ShoppingCartAddOutputSchema,
      },
    ])
    .handler(handle),
});
