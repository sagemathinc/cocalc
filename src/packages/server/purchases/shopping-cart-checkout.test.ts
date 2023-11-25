/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Declare mock constants to account for Jest function hoisting
//
const mockCreateStripeCheckoutSession = jest.fn() as jest.MockedFunction<typeof createStripeCheckoutSession>;
const mockGetCart = jest.fn() as jest.MockedFunction<typeof getCart>;
const mockPurchaseShoppingCartItem = jest.fn() as jest.MockedFunction<typeof purchaseShoppingCartItem>;
const mockTransactionClient = jest.fn() as jest.MockedFunction<typeof getTransactionClient>;
const mockComputeCost = jest.fn() as jest.MockedFunction<typeof computeCost>

import { getTransactionClient } from "@cocalc/database/pool";
import getCart from "@cocalc/server/shopping/cart/get";
import { computeCost } from "@cocalc/util/licenses/store/compute-cost";
import { uuid } from "@cocalc/util/misc";
import { ComputeCostProps } from "@cocalc/util/upgrades/shopping";

import createStripeCheckoutSession from "./create-stripe-checkout-session";
import purchaseShoppingCartItem from "./purchase-shopping-cart-item";
import { CheckoutCartItem } from "./shopping-cart-checkout";

// System under test
//
import * as sut from "./shopping-cart-checkout";

// Module mocks
//

jest.mock("@cocalc/database/pool", () => ({
  __esModule: true,
  getTransactionClient: mockTransactionClient,
}));
jest.mock("@cocalc/util/licenses/store/compute-cost", () => ({
  __esModule: true,
  computeCost: mockComputeCost,
}));
jest.mock("@cocalc/server/shopping/cart/get", () => ({
  __esModule: true,
  default: mockGetCart,
}));
jest.mock("./purchase-shopping-cart-item", () => ({
  __esModule: true,
  default: mockPurchaseShoppingCartItem,
}));
jest.mock("./create-stripe-checkout-session", () => ({
  __esModule: true,
  default: mockCreateStripeCheckoutSession,
}));


afterEach(() => {
  jest.resetAllMocks();
  jest.restoreAllMocks();
})

describe("shopping-cart-checkout", () => {
  describe("#shoppingCartCheckout", () => {
    const account_id = uuid();
    const testCheckout = {
      account_id,
      cancel_url: "/cancel",
      success_url: "/success"
    }

    const testPoolClient = {
      query: jest.fn(),
      release: jest.fn()
    };


    it("throws an error when paymentAmount is 'NaN'", async () => {
      // Assert
      //
      await expect(sut.shoppingCartCheckout({
        ...testCheckout,
        paymentAmount: NaN,
      }))
        .rejects
        .toThrow("Invalid payment amount");

      // Assert
      //
      await expect(sut.shoppingCartCheckout({
        ...testCheckout,
        paymentAmount: -NaN,
      }))
        .rejects
        .toThrow("Invalid payment amount");
    });

    it("throws an error when paymentAmount is 'Infinity'", async () => {
      // Assert
      //
      await expect(sut.shoppingCartCheckout({
        ...testCheckout,
        paymentAmount: Infinity,
      }))
        .rejects
        .toThrow("Invalid payment amount");

      // Assert
      //
      await expect(sut.shoppingCartCheckout({
        ...testCheckout,
        paymentAmount: -Infinity,
      }))
        .rejects
        .toThrow("Invalid payment amount");
    });

    it("throws an error when paymentAmount is insufficient to cover necessary charges", async () => {
      // Arrange
      //
      jest.spyOn(sut, 'getShoppingCartCheckoutParams').mockReturnValue(Promise.resolve({
        balance: NaN,
        minPayment: NaN,
        amountDue: NaN,
        chargeAmount: 1.0,
        total: NaN,
        minBalance: NaN,
        cart: []
      }));

      // Assert
      //
      await expect(sut.shoppingCartCheckout({
        ...testCheckout,
        paymentAmount: 0.5,
      }))
        .rejects
        .toThrow("insufficient to complete");
    });

    it("uses account balance when available", async () => {
      // Arrange
      //
      jest.spyOn(sut, 'getShoppingCartCheckoutParams').mockReturnValue(Promise.resolve({
        balance: NaN,
        minPayment: NaN,
        amountDue: NaN,
        chargeAmount: 0.0,
        total: NaN,
        minBalance: NaN,
        cart: []
      }));

      mockTransactionClient.mockImplementation(() => Promise.resolve(testPoolClient as any));

      // Act
      //
      const checkoutResult = await sut.shoppingCartCheckout({
        ...testCheckout,
      });

      // Assert
      //
      expect(testPoolClient.query).toHaveBeenCalledWith("COMMIT");
      expect(testPoolClient.release).toHaveBeenCalled();
      expect(checkoutResult.done).toEqual(true);
    });

    it("bails on the shopping cart transaction when shopping cart purchase fails", async () => {
      // Arrange
      //
      jest.spyOn(sut, "getShoppingCartCheckoutParams").mockReturnValue(Promise.resolve({
        balance: NaN,
        minPayment: NaN,
        amountDue: NaN,
        chargeAmount: 0.0,
        total: NaN,
        minBalance: NaN,
        cart: [{
          foo: "bar",
        }]
      }));

      const ackbError = new Error("It's a trap!");

      mockTransactionClient.mockImplementation(() => Promise.resolve(testPoolClient as any));
      mockPurchaseShoppingCartItem.mockImplementation(() => {
        throw ackbError;
      });

      // Act
      //
      await expect(sut.shoppingCartCheckout({
        ...testCheckout,
      }))
        .rejects
        .toThrow(ackbError);

      // Assert
      //
      expect(testPoolClient.release).toHaveBeenCalled();
      expect(testPoolClient.query).toHaveBeenCalledWith("ROLLBACK");
    });

    it("adds line item for minimum pay-as-you-go charge", async () => {
      // Arrange
      //
      jest.spyOn(sut, "getShoppingCartCheckoutParams").mockReturnValue(Promise.resolve({
        balance: NaN,
        minPayment: NaN,
        amountDue: 4.5,
        chargeAmount: 5.0, // Charge an extra $0.50 over amountDue to emulate pay-as-you-go charge
        total: NaN,
        minBalance: NaN,
        cart: []
      }));

      // Act
      //
      const checkoutResult = await sut.shoppingCartCheckout({
        ...testCheckout,
      });
      const checkoutSessionArgs = mockCreateStripeCheckoutSession.mock.calls.pop()?.pop();

      // Assert
      //
      expect(checkoutResult.done).toEqual(false);
      expect(checkoutSessionArgs).toEqual({
        ...testCheckout,
        line_items: [
          {
            "amount": 0.5,
            "description": expect.stringContaining("minimum payment charge"),
          },
        ],
      });
    });

    it("adds line item for extra account credit", async () => {
      // Arrange
      //
      jest.spyOn(sut, "getShoppingCartCheckoutParams").mockReturnValue(Promise.resolve({
        balance: NaN,
        minPayment: NaN,
        amountDue: 5.0,
        chargeAmount: 5.0,
        total: NaN,
        minBalance: NaN,
        cart: []
      }));

      // Act
      //
      const checkoutResult = await sut.shoppingCartCheckout({
        ...testCheckout,
        paymentAmount: 6.0,
      });
      const checkoutSessionArgs = mockCreateStripeCheckoutSession.mock.calls.pop()?.pop();

      // Assert
      //
      expect(checkoutResult.done).toEqual(false);
      expect(checkoutSessionArgs).toEqual({
        ...testCheckout,
        line_items: [
          {
            "amount": 1.0,
            "description": expect.stringContaining("account credit"),
          },
        ],
      });
    });

    it("omits line item for extra account credit when `paymentAmount` is greater than minimum charge", async () => {
      // Arrange
      //
      jest.spyOn(sut, "getShoppingCartCheckoutParams").mockReturnValue(Promise.resolve({
        balance: NaN,
        minPayment: NaN,
        amountDue: 4.5,
        chargeAmount: 5.0, // Charge an extra $0.50 over amountDue to emulate pay-as-you-go charge
        total: NaN,
        minBalance: NaN,
        cart: []
      }));

      // Act
      //
      const checkoutResult = await sut.shoppingCartCheckout({
        ...testCheckout,
        paymentAmount: 6.0,
      });
      const checkoutSessionArgs = mockCreateStripeCheckoutSession.mock.calls.pop()?.pop();

      // Assert
      //
      expect(checkoutResult.done).toEqual(false);
      expect(checkoutSessionArgs).toEqual({
        ...testCheckout,
        line_items: [
          {
            "amount": 1.0,
            "description": expect.stringContaining("account credit"),
          },
        ],
      });
    });

    it("adds line items for cart items fully paid for by existing balance", async () => {
      // Arrange
      //
      const testCart = [
        {
          cost: {
            discounted_cost: 1.0
          },
          description: {
            type: "disk",
            description: "foo",
          },
        },
      ];

      jest.spyOn(sut, "getShoppingCartCheckoutParams").mockReturnValue(Promise.resolve({
        balance: 0.3,
        minPayment: NaN,
        amountDue: 1.0,
        chargeAmount: 1.0,
        total: NaN,
        minBalance: -0.7,
        cart: testCart as CheckoutCartItem[],
      }));

      // Act
      //
      const checkoutResult = await sut.shoppingCartCheckout({
        ...testCheckout,
      });
      const checkoutSessionArgs = mockCreateStripeCheckoutSession.mock.calls.pop()?.pop();

      // Assert
      //
      expect(checkoutResult.done).toEqual(false);
      expect(checkoutSessionArgs).toEqual({
        ...testCheckout,
        line_items: [
          {
            "amount": 0,
            "description": expect.stringContaining("$1.00 deducted"),
          },
        ],
      });
    });

    it("adds line items for cart items partially paid for by existing balance", async () => {
      // Arrange
      //
      const testCart = [{
        cost: {
          discounted_cost: 1.5
        },
        description: {
          type: "disk",
          description: "foo",
        },
      }];

      jest.spyOn(sut, "getShoppingCartCheckoutParams").mockReturnValue(Promise.resolve({
        balance: 0.3,
        minPayment: NaN,
        amountDue: 1.5,
        chargeAmount: 1.5,
        total: NaN,
        minBalance: -0.7,
        cart: testCart as CheckoutCartItem[],
      }));

      // Act
      //
      const checkoutResult = await sut.shoppingCartCheckout({
        ...testCheckout,
      });
      const checkoutSessionArgs = mockCreateStripeCheckoutSession.mock.calls.pop()?.pop();

      // Assert
      //
      expect(checkoutResult.done).toEqual(false);
      expect(checkoutSessionArgs).toEqual({
        ...testCheckout,
        line_items: [
          {
            "amount": 0.5,
            "description": expect.stringContaining("$1.00 deducted"),
          },
        ],
      });
    });

    it("adds line items for cart paid for by existing balance and new balance", async () => {
      // Arrange
      //
      const testCart = [
        {
          cost: {
            discounted_cost: 1.5
          },
          description: {
            type: "disk",
            description: "foo",
          },
        },
        {
          cost: {
            discounted_cost: 3.0
          },
          description: {
            type: "disk",
            description: "foo",
          },
        },
      ];

      jest.spyOn(sut, "getShoppingCartCheckoutParams").mockReturnValue(Promise.resolve({
        balance: 1.3,
        minPayment: NaN,
        amountDue: 4.5,
        chargeAmount: 4.5,
        total: NaN,
        minBalance: -0.7,
        cart: testCart as CheckoutCartItem[],
      }));

      // Act
      //
      const checkoutResult = await sut.shoppingCartCheckout({
        ...testCheckout,
      });
      const checkoutSessionArgs = mockCreateStripeCheckoutSession.mock.calls.pop()?.pop();

      // Assert
      //
      expect(checkoutResult.done).toEqual(false);
      expect(checkoutSessionArgs).toEqual({
        ...testCheckout,
        line_items: [
          {
            "amount": 0.0,
            "description": expect.stringContaining("$1.50 deducted"),
          },
          {
            "amount": 2.5,
            "description": expect.stringContaining("$0.50 deducted"),
          },
        ],
      });
    });

    it("sorts line items in cart by ascending cost", async () => {
      // Arrange
      //
      const testCart = [
        {
          cost: {
            discounted_cost: 1.5
          },
          description: {
            type: "disk",
            description: "foo",
          },
        },
        {
          cost: {
            discounted_cost: 3.0
          },
          description: {
            type: "disk",
            description: "bar",
          },
        },
        {
          cost: {
            discounted_cost: 1.5
          },
          description: {
            type: "disk",
            description: "baz",
          },
        },
      ];

      jest.spyOn(sut, "getShoppingCartCheckoutParams").mockReturnValue(Promise.resolve({
        balance: 1.3,
        minPayment: NaN,
        amountDue: 4.0,
        chargeAmount: 4.0,
        total: NaN,
        minBalance: -0.7,
        cart: testCart as CheckoutCartItem[],
      }));

      // Act
      //
      const checkoutResult = await sut.shoppingCartCheckout({
        ...testCheckout,
      });
      const checkoutSessionArgs = mockCreateStripeCheckoutSession.mock.calls.pop()?.pop();

      // Assert
      //
      expect(checkoutResult.done).toEqual(false);
      expect(checkoutSessionArgs).toEqual({
        ...testCheckout,
        line_items: [
          {
            "amount": 0.0,
            "description": expect.stringContaining("$1.50 deducted"),
          },
          {
            "amount": 1.0,
            "description": expect.stringContaining("$0.50 deducted"),
          },
          {
            "amount": 3.0,
            "description": expect.not.stringContaining("$0.00 deducted"),
          },
        ],
      });
    });

    it("adds line items without using account balance when paymentAmount is provided", async () => {
      // Arrange
      //
      const testCart = [
        {
          cost: {
            discounted_cost: 1.5
          },
          description: {
            type: "disk",
            description: "foo",
          },
        },
        {
          cost: {
            discounted_cost: 3.0
          },
          description: {
            type: "disk",
            description: "bar",
          },
        },
        {
          cost: {
            discounted_cost: 1.5
          },
          description: {
            type: "disk",
            description: "baz",
          },
        },
      ];
      const cartTotal = testCart.reduce(
        (total, item) => total + item.cost.discounted_cost,
        0.0,
      );

      jest.spyOn(sut, "getShoppingCartCheckoutParams").mockReturnValue(Promise.resolve({
        balance: 1.3,
        minPayment: NaN,
        amountDue: cartTotal,
        chargeAmount: cartTotal,
        total: NaN,
        minBalance: -0.7,
        cart: testCart as CheckoutCartItem[],
      }));

      // Act
      //
      const checkoutResult = await sut.shoppingCartCheckout({
        ...testCheckout,
        paymentAmount: cartTotal,
      });
      const checkoutSessionArgs = mockCreateStripeCheckoutSession.mock.calls.pop()?.pop();

      // Assert
      //
      expect(checkoutResult.done).toEqual(false);
      expect(checkoutSessionArgs).toEqual({
        ...testCheckout,
        line_items: [
          {
            "amount": 1.5,
            "description": expect.not.stringContaining("$1.50 deducted"),
          },
          {
            "amount": 1.5,
            "description": expect.not.stringContaining("$0.50 deducted"),
          },
          {
            "amount": 3.0,
            "description": expect.not.stringContaining("$0.00 deducted"),
          },
        ],
      });
    });
  });

  describe("#getCheckoutCart", () => {
    const account_id = uuid();


    it("correctly computes empty cart total", async () => {
      // Arrange
      //
      const testCart = [ ];
      mockGetCart.mockReturnValue(Promise.resolve(testCart));

      // Act
      //
      const { cart, total } = await sut.getCheckoutCart(account_id);

      // Assert
      //
      expect(mockGetCart).toHaveBeenCalledWith({
        account_id,
        purchased: false,
        removed: false,
      });
      expect(total).toEqual(0);
      expect(cart).toEqual([]);
    });

    it("computes cost from item description", async () => {
      // Arrange
      //
      const testDescription: ComputeCostProps = {
        type: "cash-voucher",
        amount: 1.5,
      };
      const testCart = [{
        product: "site-license",
        checked: true,
        description: testDescription,
      }] as any[];
      const testComputedCost = {
        discounted_cost: 1.5,
      };

      mockGetCart.mockReturnValue(Promise.resolve(testCart));
      mockComputeCost.mockReturnValue(testComputedCost as any);

      // Act
      //
      const { cart, total } = await sut.getCheckoutCart(account_id);

      // Assert
      //
      expect(mockGetCart).toHaveBeenCalledWith({
        account_id,
        purchased: false,
        removed: false,
      });
      expect(mockComputeCost).toHaveBeenCalledWith(testDescription);
      expect(total).toEqual(1.5);
      expect(cart[0]).toEqual({
        ...testCart[0],
        cost: testComputedCost,
      });
    });

    it("computes cost from cart", async () => {
      // Arrange
      //
      const testCart = [ {
        product: "site-license",
        checked: true,
        description: {
          type: "cash-voucher",
          amount: 1.5,
        },
      }, {
        product: "site-license",
        checked: true,
        description: {
          type: "cash-voucher",
          amount: 3.0,
        },
      }] as any[];

      mockGetCart.mockReturnValue(Promise.resolve(testCart));
      mockComputeCost.mockImplementation((item) => ({
        discounted_cost: (item as any).amount,
      } as any));

      // Act
      //
      const { total } = await sut.getCheckoutCart(account_id);

      // Assert
      //
      expect(total).toEqual(4.5);
    });

    it("filters unchecked items from cart", async () => {
      // Arrange
      //
      const testCart = [ {
        product: "site-license",
        checked: false,
        description: {
          type: "cash-voucher",
          amount: 1.5,
        },
      }, {
        product: "site-license",
        checked: true,
        description: {
          type: "cash-voucher",
          amount: 3.0,
        },
      }] as any[];

      mockGetCart.mockReturnValue(Promise.resolve(testCart));
      mockComputeCost.mockImplementation((item) => ({
        discounted_cost: (item as any).amount,
      } as any));

      // Act
      //
      const { total } = await sut.getCheckoutCart(account_id);

      // Assert
      //
      expect(total).toEqual(3.0);
    });

    it("filters items which aren't site licenses from cart", async () => {
      // Arrange
      //
      const testCart = [ {
        product: "site-license",
        checked: true,
        description: {
          type: "cash-voucher",
          amount: 1.5,
        },
      }, {
        product: "three-lizards-in-a-trench-coat",
        checked: true,
        description: {
          type: "cash-voucher",
          amount: 3.0,
        },
      }] as any[];

      mockGetCart.mockReturnValue(Promise.resolve(testCart));
      mockComputeCost.mockImplementation((item) => ({
        discounted_cost: (item as any).amount,
      } as any));

      // Act
      //
      const { total } = await sut.getCheckoutCart(account_id);

      // Assert
      //
      expect(total).toEqual(1.5);
    });

    it("supports custom cart filters", async () => {
      // Arrange
      //
      const testCart = [ {
        product: "site-license",
        checked: true,
        description: {
          type: "cash-voucher",
          amount: 1.5,
        },
      }, {
        product: "three-lizards-in-a-trench-coat",
        checked: true,
        description: {
          type: "cash-voucher",
          amount: 3.0,
        },
      }] as any[];

      mockGetCart.mockReturnValue(Promise.resolve(testCart));
      mockComputeCost.mockImplementation((item) => ({
        discounted_cost: (item as any).amount,
      } as any));

      // Act
      //
      const { total } = await sut.getCheckoutCart(
        account_id,
        (cartItem) => cartItem.product === "three-lizards-in-a-trench-coat"
      );

      // Assert
      //
      expect(total).toEqual(3.0);
    });
  });
});
