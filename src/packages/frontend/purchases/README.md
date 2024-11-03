# Purchases

General notes about wording and design.

```mermaid
flowchart TD
    A[Decide on what to buy] --> B{Have enough credit?}
    B -- Yes --> C[Make a purchase]
    B -- No --> D[Make a payment]
    D --> C
```

## Definitions

- Payment = money paid via a credit card or other payment method to cocalc.

- Purchase = made internally in cocalc using credit

