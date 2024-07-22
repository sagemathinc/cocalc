/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// System under test
//
import getChargeAmount from "./charge-amount";
import { round2up } from "@cocalc/util/misc";

describe("charge-amount", () => {
  describe("#getChargeAmount", () => {
    it("charges nothing when sufficient account balance is available", async () => {
      // Arrange
      //
      const testChargeParams = {
        balance: 17.99914,
        minPayment: 2.5,
        minBalance: 0.0,
        cost: 17,
      };

      // Act
      //
      const charge = getChargeAmount(testChargeParams);

      // Assert
      //
      expect(charge.chargeAmount).toEqual(0.0);
      expect(charge.amountDue).toEqual(0.0);
      expect(charge.cureAmount).toEqual(0.0);
      expect(charge.minimumPaymentCharge).toEqual(0.0);
    });

    it("charges the difference between cost and account balance when sufficient account balance is not available", async () => {
      // Arrange
      //
      const testChargeParams = {
        balance: 17.55,
        minPayment: 0.0,
        minBalance: 0.0,
        cost: 18,
      };

      // Act
      //
      const charge = getChargeAmount(testChargeParams);

      // Assert
      //
      expect(charge.chargeAmount).toEqual(0.45);
      expect(charge.amountDue).toEqual(0.45);
      expect(charge.cureAmount).toEqual(0.0);
      expect(charge.minimumPaymentCharge).toEqual(0.0);
    });

    it("charges exact minimum payment when difference between cost and balance is sufficiently small", async () => {
      // Arrange
      //
      const testChargeParams = {
        balance: 17.55,
        minPayment: 2.54321,
        minBalance: 0,
        cost: 18,
      };

      // Act
      //
      const charge = getChargeAmount(testChargeParams);

      // Assert
      //
      expect(charge.chargeAmount).toEqual(2.54321);
      expect(charge.amountDue).toEqual(0.45);
      expect(charge.cureAmount).toEqual(0.0);
      expect(charge.minimumPaymentCharge.toFixed(10)).toEqual(
        (2.54321 - 0.45).toFixed(10),
      );
    });

    it("uses credit when available", async () => {
      // Arrange
      //
      const testChargeParams = {
        balance: 1.543,
        minPayment: 5.0,
        minBalance: -5.0,
        cost: 10.0,
      };

      // Act
      //
      const charge = getChargeAmount(testChargeParams);

      // Assert
      //
      expect(charge.chargeAmount).toEqual(5.0);
      expect(charge.amountDue).toEqual(3.46);
      expect(charge.cureAmount).toEqual(0.0);
      expect(charge.minimumPaymentCharge.toFixed(3)).toEqual(
        (1.543).toFixed(3),
      );
    });

    it("rounds amount due to two decimal places", async () => {
      // Arrange
      const testChargeParams = {
        balance: 17.5678,
        minPayment: 0,
        minBalance: 0,
        cost: 18,
      };

      // Act
      const charge = getChargeAmount(testChargeParams);

      // Assert
      expect(charge.chargeAmount).toEqual(
        round2up(testChargeParams.cost - testChargeParams.balance),
      );
      expect(charge.amountDue).toEqual(
        round2up(testChargeParams.cost - testChargeParams.balance),
      );
      expect(charge.cureAmount).toEqual(0.0);
      expect(charge.minimumPaymentCharge).toEqual(0.0);
    });

    it("adds charge when user balance is less than minimum balance", async () => {
      // Arrange
      const testChargeParams = {
        balance: -0.023,
        minPayment: 0.0,
        minBalance: 0.0,
        cost: 0.0,
      };

      // Act
      const charge = getChargeAmount(testChargeParams);

      // Assert
      expect(charge.chargeAmount).toEqual(
        round2up(testChargeParams.cost - testChargeParams.balance),
      );
      expect(charge.amountDue).toEqual(
        round2up(testChargeParams.cost - testChargeParams.balance),
      );
      expect(charge.cureAmount).toEqual(0.023);
      expect(charge.minimumPaymentCharge).toEqual(0.0);
    });

    it("enforces a non-negative due amount", async () => {
      // Arrange
      //
      const testChargeParams = {
        balance: 18,
        minPayment: 0.0,
        minBalance: 0.0,
        cost: 16,
      };

      // Act
      //
      const charge = getChargeAmount(testChargeParams);

      // Assert
      //
      expect(charge.chargeAmount).toEqual(0.0);
      expect(charge.amountDue).toEqual(0.0);
      expect(charge.cureAmount).toEqual(0.0);
      expect(charge.minimumPaymentCharge).toEqual(0.0);
    });
  });
});
