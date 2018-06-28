import { createTypedMap } from "../TypedMap";

// Example use

interface SaleRecord {
  name: string;
  price: number;
  time?: number; // This can be omitted
}

let Sale = createTypedMap<SaleRecord>();
let sale1 = new Sale({ name: "Latte", price: 10 });
let sale2 = sale1.set("name", "Mocha");

// let sale3 = sale1.set("NAME", "Espresso")
// Error: "NAME" is not assignable to parameter of type '"name" | "price" | "time"

// let sale4 = sale1.set("price", "50")
// Error: Argument of type '"50"' is not assignable to parameter of type 'number'.

console.log(sale1.get("name")) // Mocha
console.log(sale2.get("name")) // Jow

// Common Pitfalls

// These are usually arguments to a function
let field = "name";
let value = "thing";
// let sale5 = sale1.set(field, value);
// Error: Argument of type 'string' is not assignable to parameter of type '"name" | "price" | "time"'.

/*
Solutions:
Declare field as a const or as keyof SaleRecord
```
const field = "name";
```

or
```
let field: keyof SaleRecord = "name";
```
*/

// Don't do this. No compile time checks.
sale1.set(field as keyof SaleRecord, value)