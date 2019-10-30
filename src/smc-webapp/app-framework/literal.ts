/*

Typescript infers `["asdf", "other"]` as `string[]`

However, sometimes you would like it to be the following:
{"asdf" | "other"}[]

Calling
```
literal(["asdf", "other"])
```

Returns the type you want
*/
// TODO: Move to util/misc.ts
export const literal = <T extends string>(val: T[]) => val;
