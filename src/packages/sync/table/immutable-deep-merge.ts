/*
The immutable.js mergeDeep in immutable 4.1 is badly broken, so we have to implement our own.
It used to be fine in 3.8.

Example in immutable 3.8.2:

```ts
a = require('immutable').fromJS({a:['x','y']})
b = require('immutable').fromJS({a:['x','y']})
> JSON.stringify(a.mergeDeep(b))
'{"a":["x","y"]}'

// Same in immutable 4.1 has totally different (and very wrong) output:

> JSON.stringify(a.mergeDeep(b))
'{"a":["x","y","x","y"]}'
```


It's a documented change at https://immutable-js.com/docs/latest@main/mergeDeep

"Note: Indexed and set-like collections are merged using concat/union and therefore do not recurse."   ARGH!

Of course we want the result of the above merge to be {"a":["x","y"]}, which is what
lodash does (since in Javascript a list is like a map from integers, so the correct semantics
are clear).

Semantics of merge are discussed here: https://stackoverflow.com/questions/19965844/lodash-difference-between-extend-assign-and-merge
*/

import { merge } from "lodash";
import { fromJS, Map } from "immutable";

// This is obviously not a great approach in general, converting back and forth.  However, we only
// use this for fairly small data in exactly one place, and we can do something the same but more
// efficient later.

export default function mergeDeep(
  a: Map<string, any>,
  b: Map<string, any>
): Map<string, any> {
  const c = merge(a.toJS(), b.toJS());
  return fromJS(c);
}
