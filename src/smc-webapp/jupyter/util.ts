/*
Some simple misc functions with no dependencies.

It's very good to have these as functions rather than put
the code all over the place and have conventions about paths!

part of CoCalc
(c) SageMath, Inc., 2017
*/

import * as promiseLimitModule from "promise-limit";

// This list is inspired by OutputArea.output_types in https://github.com/jupyter/notebook/blob/master/notebook/static/notebook/js/outputarea.js
// The order matters -- we only keep the left-most type (see import-from-ipynb.coffee)

export const JUPYTER_MIMETYPES = [
  "application/javascript",
  "text/html",
  "text/markdown",
  "text/latex",
  "image/svg+xml",
  "image/png",
  "image/jpeg",
  "application/pdf",
  "text/plain"
];

// limit to a few promise api calls at once (think of running over 100+ cells)
const promiseLimit = promiseLimitModule(3);

// J = job-type, R = return-type
export function map_limit<J, R>(op: ((J) => Promise<R>), jobs: J[]): R[] {
  Promise.all(
    jobs.map(job => {
      return promiseLimit(() => op(job));
    })
  ).then(results => {
    return results;
  });
  // TODO collect problems
  return [];
}
