/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Declare mock constants to account for Jest function hoisting
//
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
import { CashVoucherCostProps } from "@cocalc/util/upgrades/shopping";

import purchaseShoppingCartItem from "./purchase-shopping-cart-item";

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

afterEach(() => {
  jest.resetAllMocks();
  jest.restoreAllMocks();
});

describe("shopping-cart-checkout", () => {
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
        numVouchers: 1,
        whenPay: "now",
        length: 8,
        title: "My Voucher",
        prefix: "",
        postfix: "",
        charset: "alphanumeric",
        expire: new Date(Date.now() + 1000 * 1000 * 1000),
      };
      const testCart = [
        {
          product: "site-license",
          lineItemAmount: 1.5,
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

  //         disk: 3,
  //         type: "quota",
  //         user: "business",
  //         boost: false,
  //         member: true,
  //         period: "monthly",
  //         uptime: "short",
  //         run_limit: 1,
  //       };

  //       // Act
  //       //
  //       const testDescription = sut.toFriendlyDescription(
  //         productDescription as SiteLicenseDescriptionDB,
  //       );

  //       // Assert
  //       //
  //       expect(testDescription).toEqual(
  //         "Business license providing 2 GB RAM, 1 shared vCPU, 3 GB disk, member hosting, 30 minutes timeout, network, up to 1 simultaneous running project",
  //       );
  //     });

  //     it("constructs cash voucher description", async () => {
  //       // Arrange
  //       //
  //       const productDescription = {
  //         type: "cash-voucher",
  //         amount: 3.5,
  //       };

  //       // Act
  //       //
  //       const testDescription = sut.toFriendlyDescription(
  //         productDescription as CashVoucherCostProps,
  //       );

  //       // Assert
  //       //
  //       expect(testDescription).toEqual("$3.50 account credit");
  //     });

  //     it("constructs default description", async () => {
  //       // Arrange
  //       //
  //       const productDescription = {
  //         type: "foobar",
  //       };

  //       // Act
  //       //
  //       const testDescription = sut.toFriendlyDescription(
  //         productDescription as SiteLicenseDescriptionDB,
  //       );

  //       // Assert
  //       //
  //       expect(testDescription).toEqual(
  //         "Credit account to complete store purchase",
  //       );
  //     });
  //   });
});
