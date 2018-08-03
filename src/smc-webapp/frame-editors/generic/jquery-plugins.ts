/* Declare plugins we use */

import "jquery";

declare global {
  interface JQuery {
    make_height_defined(): JQuery;
  }
}
