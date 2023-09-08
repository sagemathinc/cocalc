# Compute PNPM Workspace Packages

This is the code for external compute that gets added to cocalc from outside.

It's in a different pnpm workspace directory since:

- it's not needed internally as part of cocalc
- some of the websocketfs functionality is difficult to build
- we want this to be very lightweight

