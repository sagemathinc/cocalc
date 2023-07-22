/* 
This is based on 
https://gist.github.com/frobnitzem/28707410b81870e88925097fdfe1f85b 
but I converted it to modern typescript.

Yes, I looked all over npm and couldn't find anything good.

There's no license but the code is very short and it's 
just passed around implementing a very standard algorithm.
Let's just call it "public domain".
*/

// Solve the knapsack problem using recursive descent.
// This wraps the actual solver below with a nice interface.
// It also handles non-integer cost, but then the complexity
// scales with the precision of the cost!
//
// obj is an object of named [cost, benefit] pairs, e.g.
// { banana: {c:5, b:33},
//   apple:  {c:1, b:12],
//   kiwi:   {c:1, b:7}
// }
//
// max_cost is the maximum cost allowed in the knapsack.
//
export default function knapsack(
  obj: { [key: string]: { c: number; b: number } },
  max_cost: number
): {
  items: string[]; // names of the  items to include
  cost: number; // total cost of this choice
  benefit: number; // total benefit of this choice
} {
  // c = cost; b = benefit
  const arr: { c: number; b: number; n: string }[] = [];
  for (const key in obj) {
    arr.push({ c: obj[key].c, b: obj[key].b, n: key });
  }
  // Sort descending for a 'greedy' initial search order.
  arr.sort((x, y) => {
    if (x.b == y.b) {
      // lower cost breaks tie
      return x.c - y.c;
    }
    return y.b - x.b; // Consider highest value first.
  });
  const memo = {};
  let ret = knap(arr, max_cost, 0, memo);
  // console.log(Object.keys(memo).length + " calls.");
  for (let i = 0; i < ret[0].length; i++) {
    // Name the winners.
    ret[0][i] = arr[ret[0][i]].n;
  }

  return { items: ret[0], cost: ret[1], benefit: ret[2] };
}

//Knapsack algorithm
//==================
// wikipedia: [Knapsack (0/1)](http://en.wikipedia.org/wiki/Knapsack_problem#0.2F1_Knapsack_Problem)
// Given a set `[{cost:Number, benefit:Number}]`,
// find the maximum benefit possible provided that the cost
// must remain below or equal to the capacity, "max_cost",
// AND the benefit must be at or equal to "min_ben".
// **params**:
//    `items`     : [{w:Number, b:Number}],
//    `max_cost`  : Number,
//    `min_ben`   : Number
// **returns**:
//    An object containing `maxValue` and `set`

// Solve a knapsack problem. This routine is meant
// to be called by knapsack (above).
// For efficiency, items should be sorted by
// descending benefit.
//
// returns [items], cost, benefit
//
// Note:
//   This method uses dead-end elimination to avoid solving
//   extra sub-problems.
//   It uses a cache of calls at each (#items, max_cost)
//   to avoid solving similar sub-problems multiple times.
//   { (#items,max_cost) : [min_ben_req, items, max_cost_found, min_ben_found] }
function knap(items, max_cost, min_ben, memo) {
  let best: number[] = [];
  let cost = 0;
  let remain_ben = 0;
  if (min_ben < 0) min_ben = 0;
  let min_ben_inp = min_ben; // save the lower bound we started with for caching purposes

  let note = items.length + " " + max_cost; // attempt to lookup the answer
  if (note in memo) {
    if (memo[note][0] <= min_ben || memo[note][3] >= min_ben) {
      //console.log("re-used: " + note);
      return memo[note].slice(1);
    }
  }

  for (let i = 0; i < items.length; i++) {
    // determine remaining possible benefit
    if (items[i].c <= max_cost) remain_ben += items[i].b;
  }

  for (let i = 0; i < items.length; i++) {
    if (items[i].c > max_cost) {
      continue;
    } // Can't include.

    if (remain_ben < min_ben) {
      // Early termination check.
      break;
    }
    remain_ben -= items[i].b;

    let ret = knap(
      items.slice(i + 1),
      max_cost - items[i].c,
      min_ben - items[i].b,
      memo
    );
    if (ret[2] + items[i].b > min_ben) {
      // Found a better subproblem solution.
      best = ret[0].map(function (j) {
        return i + j + 1;
      });
      best.push(i);
      cost = ret[1] + items[i].c;
      min_ben = ret[2] + items[i].b; // up the ante
    }
  }

  if (best.length == 0) {
    memo[note] = [min_ben_inp, [], 0, 0];
  } else {
    memo[note] = [min_ben_inp, best, cost, min_ben];
  }

  //console.log(note, memo[note]);
  return memo[note].slice(1);
}
