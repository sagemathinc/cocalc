/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Declare mock constants to account for Jest function hoisting
//
const mockCreateStripeCheckoutSession = jest.fn() as jest.MockedFunction<
  typeof createStripeCheckoutSession
>;
const mockGetCart = jest.fn() as jest.MockedFunction<typeof getCart>;
const mockPurchaseShoppingCartItem = jest.fn() as jest.MockedFunction<
  typeof purchaseShoppingCartItem
>;
const mockTransactionClient = jest.fn() as jest.MockedFunction<
  typeof getTransactionClient
>;
const mockComputeCost = jest.fn() as jest.MockedFunction<typeof computeCost>;

import { getTransactionClient } from "@cocalc/database/pool";
import getCart from "@cocalc/server/shopping/cart/get";
import { computeCost } from "@cocalc/util/licenses/store/compute-cost";
import { uuid } from "@cocalc/util/misc";
import {
  CashVoucherCostProps,
  SiteLicenseDescriptionDB,
} from "@cocalc/util/upgrades/shopping";

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
});

describe("shopping-cart-checkout", () => {
  describe("#shoppingCartCheckout", () => {
    const account_id = uuid();
    const testCheckout = {
      account_id,
      cancel_url: "/cancel",
      success_url: "/success",
    };

    const testPoolClient = {
      query: jest.fn(),
      release: jest.fn(),
    };

    it("throws an error when paymentAmount is 'NaN'", async () => {
      // Assert
      //
      await expect(
        sut.shoppingCartCheckout({
          ...testCheckout,
          paymentAmount: NaN,
        }),
      ).rejects.toThrow("Invalid payment amount");

      // Assert
      //
      await expect(
        sut.shoppingCartCheckout({
          ...testCheckout,
          paymentAmount: -NaN,
        }),
      ).rejects.toThrow("Invalid payment amount");
    });

    it("throws an error when paymentAmount is 'Infinity'", async () => {
      // Assert
      //
      await expect(
        sut.shoppingCartCheckout({
          ...testCheckout,
          paymentAmount: Infinity,
        }),
      ).rejects.toThrow("Invalid payment amount");

      // Assert
      //
      await expect(
        sut.shoppingCartCheckout({
          ...testCheckout,
          paymentAmount: -Infinity,
        }),
      ).rejects.toThrow("Invalid payment amount");
    });

    it("throws an error when paymentAmount is insufficient to cover necessary charges", async () => {
      // Arrange
      //
      jest.spyOn(sut, "getShoppingCartCheckoutParams").mockReturnValue(
        Promise.resolve({
          balance: NaN,
          minPayment: NaN,
          amountDue: NaN,
          chargeAmount: 1.0,
          total: NaN,
          minBalance: NaN,
          minimumPaymentCharge: NaN,
          cureAmount: NaN,
          cart: [],
        }),
      );

      // Assert
      //
      await expect(
        sut.shoppingCartCheckout({
          ...testCheckout,
          paymentAmount: 0.5,
          ignoreBalance: true,
        }),
      ).rejects.toThrow("insufficient to complete");
    });

    it("throws an error when computed cart total does not match chargeAmount", async () => {
      // Arrange
      //
      jest.spyOn(sut, "getShoppingCartCheckoutParams").mockReturnValue(
        Promise.resolve({
          balance: NaN,
          minPayment: NaN,
          amountDue: 0.5,
          chargeAmount: 0.5,
          total: NaN,
          minBalance: NaN,
          minimumPaymentCharge: NaN,
          cureAmount: NaN,
          cart: [],
        }),
      );

      // Assert
      await expect(
        sut.shoppingCartCheckout({
          ...testCheckout,
          paymentAmount: 0.5,
        }),
      ).rejects.toThrow(
        "Computed cart total $0.00 diverges too much from expected charge amount $0.50.",
      );
    });

    it("does not throw an error when computed cart total does not match chargeAmount when ignoring balance", async () => {
      // Arrange
      //
      jest.spyOn(sut, "getShoppingCartCheckoutParams").mockReturnValue(
        Promise.resolve({
          balance: NaN,
          minPayment: NaN,
          amountDue: 0.5,
          chargeAmount: 0.5,
          total: NaN,
          minBalance: NaN,
          minimumPaymentCharge: NaN,
          cureAmount: NaN,
          cart: [],
        }),
      );

      // Act
      //
      const checkoutResult = await sut.shoppingCartCheckout({
        ...testCheckout,
        paymentAmount: 0.5,
        ignoreBalance: true,
      });

      // Assert
      //
      expect(checkoutResult.done).toEqual(false);
    });

    it("uses account balance when available", async () => {
      // Arrange
      //
      jest.spyOn(sut, "getShoppingCartCheckoutParams").mockReturnValue(
        Promise.resolve({
          balance: NaN,
          minPayment: NaN,
          amountDue: NaN,
          chargeAmount: 0.0,
          total: NaN,
          minBalance: NaN,
          minimumPaymentCharge: NaN,
          cureAmount: NaN,
          cart: [],
        }),
      );

      mockTransactionClient.mockImplementation(() =>
        Promise.resolve(testPoolClient as any),
      );

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
      jest.spyOn(sut, "getShoppingCartCheckoutParams").mockReturnValue(
        Promise.resolve({
          balance: NaN,
          minPayment: NaN,
          amountDue: NaN,
          chargeAmount: 0.0,
          total: NaN,
          minBalance: NaN,
          minimumPaymentCharge: NaN,
          cureAmount: NaN,
          cart: [
            {
              foo: "bar",
            },
          ],
        }),
      );

      const ackbError = new Error("It's a trap!");

      mockTransactionClient.mockImplementation(() =>
        Promise.resolve(testPoolClient as any),
      );
      mockPurchaseShoppingCartItem.mockImplementation(() => {
        throw ackbError;
      });

      // Act
      //
      await expect(
        sut.shoppingCartCheckout({
          ...testCheckout,
        }),
      ).rejects.toThrow(ackbError);

      // Assert
      //
      expect(testPoolClient.release).toHaveBeenCalled();
      expect(testPoolClient.query).toHaveBeenCalledWith("ROLLBACK");
    });

    it("adds line item for minimum pay-as-you-go charge", async () => {
      // Arrange
      //
      jest.spyOn(sut, "getShoppingCartCheckoutParams").mockReturnValue(
        Promise.resolve({
          balance: NaN,
          minPayment: NaN,
          amountDue: 0.0,
          chargeAmount: 0.5, // Charge an extra $0.50 over amountDue to emulate pay-as-you-go charge
          total: NaN,
          minBalance: NaN,
          minimumPaymentCharge: 0.5,
          cureAmount: NaN,
          cart: [],
        }),
      );

      // Act
      //
      const checkoutResult = await sut.shoppingCartCheckout({
        ...testCheckout,
      });
      const checkoutSessionArgs = mockCreateStripeCheckoutSession.mock.calls
        .pop()
        ?.pop();

      // Assert
      //
      expect(checkoutResult.done).toEqual(false);
      expect(checkoutSessionArgs).toEqual({
        ...testCheckout,
        line_items: [
          {
            amount: 0.5,
            description: expect.stringContaining("minimum payment charge"),
          },
        ],
      });
    });

    it("adds line item for extra account credit", async () => {
      // Arrange
      //
      const testCart = [
        {
          cost: {
            cost: 1.0,
          },
          description: {
            type: "disk",
            description: "foo",
          },
        },
      ];

      jest.spyOn(sut, "toFriendlyDescription").mockReturnValue("test");
      jest.spyOn(sut, "getShoppingCartCheckoutParams").mockReturnValue(
        Promise.resolve({
          balance: NaN,
          minPayment: NaN,
          amountDue: 1.0,
          chargeAmount: 1.0,
          total: NaN,
          minBalance: NaN,
          minimumPaymentCharge: NaN,
          cureAmount: NaN,
          cart: testCart,
        }),
      );

      // Act
      //
      const checkoutResult = await sut.shoppingCartCheckout({
        ...testCheckout,
        paymentAmount: 2.0,
      });
      const checkoutSessionArgs = mockCreateStripeCheckoutSession.mock.calls
        .pop()
        ?.pop();

      // Assert
      //
      expect(checkoutResult.done).toEqual(false);
      expect(checkoutSessionArgs).toEqual({
        ...testCheckout,
        line_items: [
          expect.objectContaining({
            description: "test",
          }),
          {
            amount: 1.0,
            description: expect.stringContaining("account credit"),
          },
        ],
      });
    });

    it("does not add extra account credit when ignoring existing balance", async () => {
      // Arrange
      //
      jest.spyOn(sut, "toFriendlyDescription").mockReturnValue("test");
      jest.spyOn(sut, "getShoppingCartCheckoutParams").mockReturnValue(
        Promise.resolve({
          balance: 10.0,
          minPayment: NaN,
          amountDue: 1.0,
          chargeAmount: 1.0,
          total: NaN,
          minBalance: NaN,
          minimumPaymentCharge: NaN,
          cureAmount: NaN,
          cart: [],
        }),
      );

      // Act
      //
      const checkoutResult = await sut.shoppingCartCheckout({
        ...testCheckout,
        paymentAmount: 2.0,
        ignoreBalance: true,
      });
      const checkoutSessionArgs = mockCreateStripeCheckoutSession.mock.calls
        .pop()
        ?.pop();

      // Assert
      //
      expect(checkoutResult.done).toEqual(false);
      expect(checkoutSessionArgs).toEqual({
        ...testCheckout,
        line_items: [],
      });
    });

    it("adds line item to settle account credit", async () => {
      // Arrange
      //
      const testCart = [
        {
          cost: {
            cost: 1.0,
          },
          description: {
            type: "disk",
            description: "foo",
          },
        },
      ];

      jest.spyOn(sut, "toFriendlyDescription").mockReturnValue("test");
      jest.spyOn(sut, "getShoppingCartCheckoutParams").mockReturnValue(
        Promise.resolve({
          balance: -0.1234,
          minPayment: NaN,
          amountDue: 1.0,
          chargeAmount: 1.1234,
          total: NaN,
          minBalance: 0.0,
          minimumPaymentCharge: NaN,
          cureAmount: 0.1234,
          cart: testCart,
        }),
      );

      // Act
      //
      const checkoutResult = await sut.shoppingCartCheckout({
        ...testCheckout,
        paymentAmount: 1.1234,
      });
      const checkoutSessionArgs = mockCreateStripeCheckoutSession.mock.calls
        .pop()
        ?.pop();

      // Assert
      //
      expect(checkoutResult.done).toEqual(false);
      expect(checkoutSessionArgs).toEqual({
        ...testCheckout,
        line_items: [
          expect.objectContaining({
            description: "test",
          }),
          {
            amount: 0.13,
            description: expect.stringContaining("existing balance deficit"),
          },
        ],
      });
    });

    it("omits line item for extra account credit when `paymentAmount` is equal to minimum charge", async () => {
      // Arrange
      //
      const testCart = [
        {
          cost: {
            cost: 4.5,
          },
          description: {
            type: "disk",
            description: "foo",
          },
        },
      ];

      jest.spyOn(sut, "toFriendlyDescription").mockReturnValue("test");
      jest.spyOn(sut, "getShoppingCartCheckoutParams").mockReturnValue(
        Promise.resolve({
          balance: NaN,
          minPayment: 5.0,
          amountDue: 4.5,
          chargeAmount: 5.0,
          total: NaN,
          minBalance: NaN,
          minimumPaymentCharge: 0.5,
          cureAmount: NaN,
          cart: testCart,
        }),
      );

      // Act
      //
      const checkoutResult = await sut.shoppingCartCheckout({
        ...testCheckout,
        paymentAmount: 5.0,
      });
      const checkoutSessionArgs = mockCreateStripeCheckoutSession.mock.calls
        .pop()
        ?.pop();

      // Assert
      //
      expect(checkoutResult.done).toEqual(false);
      expect(checkoutSessionArgs).toEqual({
        ...testCheckout,
        line_items: [
          expect.objectContaining({
            description: "test",
          }),
          expect.objectContaining({
            description: expect.stringContaining("minimum payment charge"),
          }),
        ],
      });
    });

    it("adds line items for cart items partially paid for by existing balance", async () => {
      // Arrange
      //
      const testCart = [
        {
          cost: {
            cost: 1.5,
          },
          description: {
            type: "disk",
            description: "foo",
          },
        },
      ];

      jest.spyOn(sut, "toFriendlyDescription").mockReturnValue("test");
      jest.spyOn(sut, "getShoppingCartCheckoutParams").mockReturnValue(
        Promise.resolve({
          balance: 0.3,
          minPayment: NaN,
          amountDue: 0.5,
          chargeAmount: 0.5,
          total: NaN,
          minBalance: -0.7,
          minimumPaymentCharge: NaN,
          cureAmount: NaN,
          cart: testCart as CheckoutCartItem[],
        }),
      );

      // Act
      //
      const checkoutResult = await sut.shoppingCartCheckout({
        ...testCheckout,
      });
      const checkoutSessionArgs = mockCreateStripeCheckoutSession.mock.calls
        .pop()
        ?.pop();

      // Assert
      //
      expect(checkoutResult.done).toEqual(false);
      expect(checkoutSessionArgs).toEqual({
        ...testCheckout,
        line_items: [
          {
            amount: 0.5,
            description: expect.stringContaining("$1.00 deducted"),
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
            cost: 1.5,
          },
          description: {
            type: "disk",
            description: "foo",
          },
        },
        {
          cost: {
            cost: 3.0,
          },
          description: {
            type: "disk",
            description: "foo",
          },
        },
      ];

      jest.spyOn(sut, "toFriendlyDescription").mockReturnValue("test");
      jest.spyOn(sut, "getShoppingCartCheckoutParams").mockReturnValue(
        Promise.resolve({
          balance: 1.3,
          minPayment: NaN,
          amountDue: 2.5,
          chargeAmount: 2.5,
          total: NaN,
          minBalance: -0.7,
          minimumPaymentCharge: NaN,
          cureAmount: NaN,
          cart: testCart as CheckoutCartItem[],
        }),
      );

      // Act
      //
      const checkoutResult = await sut.shoppingCartCheckout({
        ...testCheckout,
      });
      const checkoutSessionArgs = mockCreateStripeCheckoutSession.mock.calls
        .pop()
        ?.pop();

      // Assert
      //
      expect(checkoutResult.done).toEqual(false);
      expect(checkoutSessionArgs).toEqual({
        ...testCheckout,
        line_items: [
          {
            amount: 0.0,
            description: expect.stringContaining("$1.50 deducted"),
          },
          {
            amount: 2.5,
            description: expect.stringContaining("$0.50 deducted"),
          },
        ],
      });
    });

    it("does not use balance when balance is to be ignored", async () => {
      // Arrange
      //
      const testCart = [
        {
          cost: {
            cost: 1.5,
          },
          description: {
            type: "disk",
            description: "foo",
          },
        },
      ];

      jest.spyOn(sut, "toFriendlyDescription").mockReturnValue("test");
      jest.spyOn(sut, "getShoppingCartCheckoutParams").mockReturnValue(
        Promise.resolve({
          balance: 0.3,
          minPayment: NaN,
          amountDue: 0.5,
          chargeAmount: 0.5, // Emulates partial account balance
          total: NaN,
          minBalance: -0.7,
          minimumPaymentCharge: NaN,
          cureAmount: NaN,
          cart: testCart as CheckoutCartItem[],
        }),
      );

      // Act
      //
      const checkoutResult = await sut.shoppingCartCheckout({
        ...testCheckout,
        paymentAmount: 0.5,
        ignoreBalance: true,
      });
      const checkoutSessionArgs = mockCreateStripeCheckoutSession.mock.calls
        .pop()
        ?.pop();

      // Assert
      //
      expect(checkoutResult.done).toEqual(false);
      expect(checkoutSessionArgs).toEqual({
        ...testCheckout,
        line_items: [
          {
            amount: 1.5,
            description: expect.not.stringContaining("deducted from"),
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
            cost: 1.5,
          },
          description: {
            type: "disk",
            description: "foo",
          },
        },
        {
          cost: {
            cost: 3.0,
          },
          description: {
            type: "disk",
            description: "bar",
          },
        },
        {
          cost: {
            cost: 1.5,
          },
          description: {
            type: "disk",
            description: "baz",
          },
        },
      ];

      jest.spyOn(sut, "toFriendlyDescription").mockReturnValue("test");
      jest.spyOn(sut, "getShoppingCartCheckoutParams").mockReturnValue(
        Promise.resolve({
          balance: 1.3,
          minPayment: NaN,
          amountDue: 4.0,
          chargeAmount: 4.0,
          total: NaN,
          minBalance: -0.7,
          minimumPaymentCharge: NaN,
          cureAmount: NaN,
          cart: testCart as CheckoutCartItem[],
        }),
      );

      // Act
      //
      const checkoutResult = await sut.shoppingCartCheckout({
        ...testCheckout,
      });
      const checkoutSessionArgs = mockCreateStripeCheckoutSession.mock.calls
        .pop()
        ?.pop();

      // Assert
      //
      expect(checkoutResult.done).toEqual(false);
      expect(checkoutSessionArgs).toEqual({
        ...testCheckout,
        line_items: expect.arrayContaining([
          {
            amount: 0.0,
            description: expect.stringContaining("$1.50 deducted"),
          },
          {
            amount: 1.0,
            description: expect.stringContaining("$0.50 deducted"),
          },
          {
            amount: 3.0,
            description: expect.not.stringContaining("$0.00 deducted"),
          },
        ]),
      });
    });

    it("adds line items without using account balance when ignoreBalance is true", async () => {
      // Arrange
      //
      const testCart = [
        {
          cost: {
            cost: 1.5,
          },
          description: {
            type: "disk",
            description: "foo",
          },
        },
        {
          cost: {
            cost: 3.0,
          },
          description: {
            type: "disk",
            description: "bar",
          },
        },
        {
          cost: {
            cost: 1.5,
          },
          description: {
            type: "disk",
            description: "baz",
          },
        },
      ];
      const cartTotal = testCart.reduce(
        (total, item) => total + item.cost.cost,
        0.0,
      );

      jest.spyOn(sut, "toFriendlyDescription").mockReturnValue("test");
      jest.spyOn(sut, "getShoppingCartCheckoutParams").mockReturnValue(
        Promise.resolve({
          balance: 1.3,
          minPayment: NaN,
          amountDue: cartTotal,
          chargeAmount: cartTotal,
          total: NaN,
          minBalance: -0.7,
          minimumPaymentCharge: NaN,
          cureAmount: NaN,
          cart: testCart as CheckoutCartItem[],
        }),
      );

      // Act
      //
      const checkoutResult = await sut.shoppingCartCheckout({
        ...testCheckout,
        paymentAmount: cartTotal,
        ignoreBalance: true,
      });
      const checkoutSessionArgs = mockCreateStripeCheckoutSession.mock.calls
        .pop()
        ?.pop();

      // Assert
      //
      expect(checkoutResult.done).toEqual(false);
      expect(checkoutSessionArgs).toEqual({
        ...testCheckout,
        line_items: [
          {
            amount: 1.5,
            description: expect.not.stringContaining("$1.50 deducted"),
          },
          {
            amount: 1.5,
            description: expect.not.stringContaining("$0.50 deducted"),
          },
          {
            amount: 3.0,
            description: expect.not.stringContaining("$0.00 deducted"),
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
      const testCart = [];
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
      const testDescription: CashVoucherCostProps = {
        type: "cash-voucher",
        amount: 1.5,
      };
      const testCart = [
        {
          product: "site-license",
          checked: true,
          description: testDescription,
        },
      ] as any[];
      const testComputedCost = {
        cost: 1.5,
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
      const testCart = [
        {
          product: "site-license",
          checked: true,
          description: {
            type: "cash-voucher",
            amount: 1.5,
          },
        },
        {
          product: "site-license",
          checked: true,
          description: {
            type: "cash-voucher",
            amount: 3.0,
          },
        },
      ] as any[];

      mockGetCart.mockReturnValue(Promise.resolve(testCart));
      mockComputeCost.mockImplementation(
        (item) =>
          ({
            cost: (item as any).amount,
          }) as any,
      );

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
      const testCart = [
        {
          product: "site-license",
          checked: false,
          description: {
            type: "cash-voucher",
            amount: 1.5,
          },
        },
        {
          product: "site-license",
          checked: true,
          description: {
            type: "cash-voucher",
            amount: 3.0,
          },
        },
      ] as any[];

      mockGetCart.mockReturnValue(Promise.resolve(testCart));
      mockComputeCost.mockImplementation(
        (item) =>
          ({
            cost: (item as any).amount,
          }) as any,
      );

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
      const testCart = [
        {
          product: "site-license",
          checked: true,
          description: {
            type: "cash-voucher",
            amount: 1.5,
          },
        },
        {
          product: "three-lizards-in-a-trench-coat",
          checked: true,
          description: {
            type: "cash-voucher",
            amount: 3.0,
          },
        },
      ] as any[];

      mockGetCart.mockReturnValue(Promise.resolve(testCart));
      mockComputeCost.mockImplementation(
        (item) =>
          ({
            cost: (item as any).amount,
          }) as any,
      );

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
      const testCart = [
        {
          product: "site-license",
          checked: true,
          description: {
            type: "cash-voucher",
            amount: 1.5,
          },
        },
        {
          product: "three-lizards-in-a-trench-coat",
          checked: true,
          description: {
            type: "cash-voucher",
            amount: 3.0,
          },
        },
      ] as any[];

      mockGetCart.mockReturnValue(Promise.resolve(testCart));
      mockComputeCost.mockImplementation(
        (item) =>
          ({
            cost: (item as any).amount,
          }) as any,
      );

      // Act
      //
      const { total } = await sut.getCheckoutCart(
        account_id,
        (cartItem) => cartItem.product === "three-lizards-in-a-trench-coat",
      );

      // Assert
      //
      expect(total).toEqual(3.0);
    });
  });

  describe("#toFriendlyName", () => {
    it("constructs disk description", async () => {
      // Arrange
      //
      const productDescription = {
        type: "disk",
        dedicated_disk: {
          size_gb: 512,
          speed: "ssd",
        },
      };

      // Act
      //
      const testDescription = sut.toFriendlyDescription(
        productDescription as SiteLicenseDescriptionDB,
      );

      // Assert
      //
      expect(testDescription).toEqual(
        "Dedicated Disk (512G size and fast speed)",
      );
    });

    it("constructs VM description", async () => {
      // Arrange
      //
      const productDescription = {
        type: "vm",
        dedicated_vm: {
          name: "raspberry pi",
          machine: "n2-standard-2",
        },
      };

      // Act
      //
      const testDescription = sut.toFriendlyDescription(
        productDescription as SiteLicenseDescriptionDB,
      );

      // Assert
      //
      expect(testDescription).toEqual("Dedicated VM 2 vCPU cores, 6 GB RAM");
    });

    it("constructs quota description", async () => {
      // Arrange
      //
      const productDescription = {
        cpu: 1,
        ram: 2,
        disk: 3,
        type: "quota",
        user: "business",
        boost: false,
        member: true,
        period: "monthly",
        uptime: "short",
        run_limit: 1,
      };

      // Act
      //
      const testDescription = sut.toFriendlyDescription(
        productDescription as SiteLicenseDescriptionDB,
      );

      // Assert
      //
      expect(testDescription).toEqual(
        "Business license providing 2 GB RAM, 1 shared vCPU, 3 GB disk, member hosting, 30 minutes timeout, network, up to 1 simultaneous running project",
      );
    });

    it("constructs cash voucher description", async () => {
      // Arrange
      //
      const productDescription = {
        type: "cash-voucher",
        amount: 3.5,
      };

      // Act
      //
      const testDescription = sut.toFriendlyDescription(
        productDescription as CashVoucherCostProps,
      );

      // Assert
      //
      expect(testDescription).toEqual("$3.50 account credit");
    });

    it("constructs default description", async () => {
      // Arrange
      //
      const productDescription = {
        type: "foobar",
      };

      // Act
      //
      const testDescription = sut.toFriendlyDescription(
        productDescription as SiteLicenseDescriptionDB,
      );

      // Assert
      //
      expect(testDescription).toEqual(
        "Credit account to complete store purchase",
      );
    });
  });
});
