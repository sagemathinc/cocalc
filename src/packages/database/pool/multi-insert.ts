/*
The pg driver doesn't support inserting multiple rows in a single
query.  There is a simple workaround at

https://github.com/brianc/node-postgres/issues/957#issuecomment-426852393

which I think would work for up to 100000/n rows, n is the number of values.
I copied it here.

Example:

var videos = [["Peru is a nice country.", "limaGuy"], ["Breaking bad is a great show.", "mikeGuy"], ["I like the winter.", "novemberGuy"]]

Query(
    `INSERT INTO videos (title, author) VALUES ${expand(videos.length, 2)}`,
    flatten(videos)
)
*/

// expand(3, 2) returns "($1, $2), ($3, $4), ($5, $6)"
function expand(rowCount: number, columnCount: number, startAt = 1): string {
  let index = startAt;
  return Array(rowCount)
    .fill(0)
    .map(
      () =>
        `(${Array(columnCount)
          .fill(0)
          .map(() => `$${index++}`)
          .join(", ")})`
    )
    .join(", ");
}

// flatten([[1, 2], [3, 4]]) returns [1, 2, 3, 4]
function flatten(arr: any[][]): any[] {
  const newArr: any[] = [];
  arr.forEach((v) => v.forEach((p) => newArr.push(p)));
  return newArr;
}

export default function format(
  query: string, // the usual query, but without the VALUES part, e.g., "INSERT INTO videos (title, author)".
  values: any[][] // the values as an array of arrays (the rows)
): { query: string; values: any[] } {
  return {
    query: `${query} VALUES ${expand(values.length, values?.[0].length ?? 0)}`,
    values: flatten(values),
  };
}
