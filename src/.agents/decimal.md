# Decimal Purchasing Plan

Goal: eliminate floating-point rounding in purchasing/billing by using
PostgreSQL exact numeric types and Decimal-based arithmetic in JS/TS.

## Decisions to lock

- Use `numeric(20,10)` for all money pg types.
- Use `Decimal` objects for runtime money representation and serialize to
  strings at boundaries (keep numbers only at display/Stripe boundaries).

## Plan

1. Inventory all money fields in the db schema and switch them to the chosen
   numeric pg type. Start with:
   - purchases: cost, cost_per_hour, cost_so_far
   - statements: balance, total_charges, total_credits
   - subscriptions: cost
   - purchase_quotas: value
   - accounts: balance, min_balance
   - vouchers: cost, tax
   - membership_tiers: price_monthly, price_yearly
   - compute_servers: cost_per_hour
   - cloud_filesystems: cost (estimated accumulated cost)
   - any other money-ish fields found during the sweep (search for pg_type
     real/REAL/double precision and money descriptions).

2. Update SQL helpers/constants to avoid float casts and keep numeric math end
   to end:
   - adjust COST_OR_METERED_COST in purchases/get-balance to return numeric
   - remove ::real/::float casts in purchases queries; use numeric arithmetic
   - ensure SUM/COALESCE in purchases/statements queries stay numeric

3. Add/extend money helpers (likely in util) that:
   - accept Decimal.Value (number|string|Decimal)
   - return Decimal or string for internal math
   - provide add/sub/mul/div/compare/round2up/round2down equivalents
   - format for display or Stripe at the edges

4. Server audit: replace float arithmetic with Decimal helpers anywhere money
   is computed or compared. Focus on:
   - get-balance, get-charges, get-spend-rate, get-purchases
   - create-statements, maintain-auto-balance, maintain-automatic-payments
   - is-purchase-allowed, create-purchase, create-credit/refund, stripe helpers

5. Frontend audit: replace money arithmetic with Decimal helpers where totals,
   balances, and costs are computed (not just displayed). Focus on:
   - purchases tables and totals
   - payment flows and Stripe amount assembly
   - pay-as-you-go live cost calculations
   - unpaid subscriptions totals

6. Adjust types and API payloads as needed for money representation (Decimal or
   string); update any sorters or comparisons that assume `number`.

7. Update and add tests to lock in exact totals and rounding behavior (server
   purchases tests, statements tests, frontend calculations).

8. Run targeted tests for purchases/stripe logic and ensure schema sync builds.
