/* Determine the port that the hub will serve on.

If the environment variable PORT is set, use that port; otherwise, use port 5000.

The default export of this module is the port number.
*/

const DEFAULT_PORT = 5000;

function port(): number {
  if (process.env.PORT) {
    return parseInt(process.env.PORT);
  }
  return DEFAULT_PORT;
}

export default port();
