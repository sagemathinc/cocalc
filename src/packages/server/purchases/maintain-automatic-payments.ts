/*
For each account that has automatic payments setup (so stripe_usage_subscription is
set in the accounts table), we check to see if:

- their most recent statement has the fields automatic_payment and paid_purchase_id
  both null AND a negative balance, or
- they have at least one subscriptions with status 'unpaid'.

If that is the case, we add up everything that is due and make a charge.
If the charge goes through, then it will get credited to the account and
the subscriptions will get renewed.
*/

export default async function maintainAutomaticPayments() {
  
  
}
