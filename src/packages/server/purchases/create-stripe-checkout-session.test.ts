/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Declare mock constants to account for Jest function hoisting
//
const mockGetServerSettings = jest.fn() as jest.MockedFunction<typeof getServerSettings>;
const mockGetStripeConnection = jest.fn() as jest.MockedFunction<typeof getConn>;
const mockIsValidAccount = jest.fn() as jest.MockedFunction<typeof isValidAccount>;

import { uuid } from "@cocalc/util/misc";
import { getServerSettings } from "@cocalc/database/settings";
import getConn from "@cocalc/server/stripe/connection";
import isValidAccount from "@cocalc/server/accounts/is-valid-account";

// System under test
//
import * as sut from "./create-stripe-checkout-session";


// Module mocks
//
jest.mock("@cocalc/database/settings/server-settings", () => ({
  __esModule: true,
  getServerSettings: mockGetServerSettings,
}));
jest.mock("@cocalc/server/stripe/connection", () => ({
  __esModule: true,
  default: mockGetStripeConnection,
}));
jest.mock("@cocalc/server/accounts/is-valid-account", () => ({
  __esModule: true,
  default: mockIsValidAccount,
}));

afterEach(() => {
  jest.resetAllMocks();
  jest.restoreAllMocks();
})

describe("create-stripe-checkout-session", () => {
  describe("#createStripeCheckoutSession", () => {
    const account_id = uuid();
    const testSessionOpts = {
      account_id,
      cancel_url: "/cancel",
      success_url: "/success",
      line_items: []
    }

    it("throws an error when a Stripe session exists", async () => {
      // Arrange
      //
      jest.spyOn(sut, "getCurrentSession").mockReturnValue(Promise.resolve({
        id: "foo",
        url: "bar",
      }));

      // Act/Assert
      //
      await expect(sut.createStripeCheckoutSession({
        ...testSessionOpts,
      }))
        .rejects
        .toThrow("active stripe checkout");
    });

    it("throws an error when a Stripe session exists", async () => {
      // Arrange
      //
      jest.spyOn(sut, "getCurrentSession").mockReturnValue(Promise.resolve({
        id: "foo",
        url: "bar",
      }));

      // Act/Assert
      //
      await expect(sut.createStripeCheckoutSession({
        ...testSessionOpts,
      }))
        .rejects
        .toThrow("active stripe checkout");
    });

    it("throws an error when cart total is not provided", async () => {
      // Arrange
      //
      jest.spyOn(sut, "getCurrentSession").mockReturnValue(Promise.resolve(undefined));

      mockGetServerSettings.mockReturnValue(Promise.resolve({
        pay_as_you_go_min_payment: 0.0
      } as any));

      // Act/Assert
      //
      await expect(sut.createStripeCheckoutSession({
        ...testSessionOpts,
      }))
        .rejects
        .toThrow("Amount must be at least");
    });

    it("conforms to minimum Stripe transaction charge when forced", async () => {
      // Arrange
      //
      const testStripeId = uuid();
      const mockCreateStripeSession = jest.fn();

      jest.spyOn(sut, "getCurrentSession").mockReturnValue(Promise.resolve(undefined));
      jest.spyOn(sut, "getStripeCustomerId").mockReturnValue(Promise.resolve(testStripeId));
      jest.spyOn(sut, "setStripeCheckoutSession").mockImplementation(() => Promise.resolve());

      mockGetStripeConnection.mockReturnValue(Promise.resolve({
        checkout: {
          sessions: {
            create: mockCreateStripeSession,
          }
        }
      } as any));

      mockGetServerSettings.mockReturnValue(Promise.resolve({
        pay_as_you_go_min_payment: 1.0
      } as any));

      mockIsValidAccount.mockReturnValue(Promise.resolve(true));

      // Act
      //
      await sut.createStripeCheckoutSession({
        ...testSessionOpts,
        force: true,
      });

      // Assert
      //
      expect(mockCreateStripeSession).toHaveBeenCalledWith(expect.objectContaining({
        line_items: expect.arrayContaining([
          expect.objectContaining({
            quantity: 1,
            price_data: expect.objectContaining({
              product_data: expect.objectContaining({
                name: expect.stringContaining("payment processor transaction charge")
              }),
            }),
          }),
        ]),
      }));
    });

    it("throws an error when purchase amount is too high", async () => {
      // Arrange
      //
      const testLineItems = [{
        amount: Number.MAX_VALUE,
      } as any];

      jest.spyOn(sut, "getCurrentSession").mockReturnValue(Promise.resolve(undefined));

      mockGetServerSettings.mockReturnValue(Promise.resolve({
        pay_as_you_go_min_payment: 0.0
      }));

      // Act/Assert
      //
      await expect(sut.createStripeCheckoutSession({
        ...testSessionOpts,
        line_items: testLineItems
      }))
        .rejects
        .toThrow("Amount exceeds");
    });

    it("throws an error when provided line item without description", async () => {
      // Arrange
      //
      const testLineItems = [
        {
          amount: 2.0,
          description: "foo"
        }, {
          amount: 1.0,
          description: " ",
        },
      ];

      jest.spyOn(sut, "getCurrentSession").mockReturnValue(Promise.resolve(undefined));

      mockGetServerSettings.mockReturnValue(Promise.resolve({
        pay_as_you_go_min_payment: 0.0
      }));

      // Act/Assert
      //
      await expect(sut.createStripeCheckoutSession({
        ...testSessionOpts,
        line_items: testLineItems,
      }))
        .rejects
        .toThrow("descriptions must be nontrivial");
    });

    it("throws an error when account is invalid", async () => {
      // Arrange
      //
      const testLineItems = [
        {
          amount: 2.0,
          description: "foo"
        },
      ];

      jest.spyOn(sut, "getCurrentSession").mockReturnValue(Promise.resolve(undefined));

      mockGetServerSettings.mockReturnValue(Promise.resolve({
        pay_as_you_go_min_payment: 0.0
      }));

      mockIsValidAccount.mockReturnValue(Promise.resolve(false));

      // Act/Assert
      //
      await expect(sut.createStripeCheckoutSession({
        ...testSessionOpts,
        line_items: testLineItems,
      }))
        .rejects
        .toThrow("account must be valid");
    });

    it("throws an error when provided empty success_url", async () => {
      // Arrange
      //
      const testLineItems = [
        {
          amount: 2.0,
          description: "foo"
        },
      ];

      jest.spyOn(sut, "getCurrentSession").mockReturnValue(Promise.resolve(undefined));

      mockGetServerSettings.mockReturnValue(Promise.resolve({
        pay_as_you_go_min_payment: 0.0
      }));

      mockIsValidAccount.mockReturnValue(Promise.resolve(true));

      // Act/Assert
      //
      await expect(sut.createStripeCheckoutSession({
        ...testSessionOpts,
        line_items: testLineItems,
        success_url: "",
      }))
        .rejects
        .toThrow("success_url");
    });

    it("adds line items to Stripe session", async () => {
      // Arrange
      //
      const testStripeId = uuid();
      const testLineItems = [
        {
          amount: 2.0,
          description: "foo"
        },
        {
          amount: 1.0,
          description: "bar"
        },
      ];
      const mockCreateStripeSession = jest.fn();

      jest.spyOn(sut, "getCurrentSession").mockReturnValue(Promise.resolve(undefined));
      jest.spyOn(sut, "getStripeCustomerId").mockReturnValue(Promise.resolve(testStripeId));
      jest.spyOn(sut, "setStripeCheckoutSession").mockImplementation(() => Promise.resolve());

      mockGetStripeConnection.mockReturnValue(Promise.resolve({
        checkout: {
          sessions: {
            create: mockCreateStripeSession,
          }
        }
      } as any));

      mockGetServerSettings.mockReturnValue(Promise.resolve({
        pay_as_you_go_min_payment: 1.0
      } as any));

      mockIsValidAccount.mockReturnValue(Promise.resolve(true));

      // Act
      //
      await sut.createStripeCheckoutSession({
        ...testSessionOpts,
        line_items: testLineItems,
      });

      // Assert
      //
      expect(mockCreateStripeSession).toHaveBeenCalledWith(expect.objectContaining({
        line_items: expect.arrayContaining([
          expect.objectContaining({
            quantity: 1,
            price_data: expect.objectContaining({
              unit_amount: 200,
              product_data: expect.objectContaining({
                name: expect.stringContaining("foo")
              }),
            }),
          }),
          expect.objectContaining({
            quantity: 1,
            price_data: expect.objectContaining({
              unit_amount: 100,
              product_data: expect.objectContaining({
                name: expect.stringContaining("bar")
              }),
            }),
          }),
        ]),
      }));
    });
  });
});
