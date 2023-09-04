# @cocalc/sync\-client

Currently, this is a  lightweight node.js client so that **a node.js process**
**can participate in realtime sync via** https://cocalc.com just like a web browser, i.e., via a websocket connection.

In particular, this lets a node.js process connect directly to a cocalc project as if it were like a web browser.

This is meant just to enable connecting to a realtime sync session.  It doesn't actually know anything about the cocalc file types \(e.g., jupyter notebooks, etc.\), so you can't just plug into one of those sessions without additional work. See the @cocalc/compute package for such additional work.

