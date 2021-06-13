# Open CoCalc landing page

These are the assets for the open source landing page, which is used
when @cocalc/landing isn't installed. It's written using pug templates
and the code that actually serves this is in `smc-hub/open-cocalc-server.ts`.

TODO: I [ws] am going to rewrite this using next.js + react...

Another note: I can't figure out how using pug to reference `smc-webapp/_colors.sass` in a way that satisfies our npm modules abstractions. So I just made a copy of that file. It doesn't matter, since this will be rewritten in react soon.
