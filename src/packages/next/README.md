# The Next.js Server

This is a next.js app, which is used as part of CoCalc to provide the landing page and the share server.

To develop this, mostly just edit code here and it will automatically reload (hot module reloading) without you having to refresh the page.  As long as you're not changing basic configuration, you don't have to restart the server.

You don't **need** to start your own nextjs server here -- the hub handles that.  That said, you can, especially for debugging purposes -- see `package.json` .

## The Landing Page

The landing page is `pages/index.tsx`.

## The Share Server

The paths for the share server are in `pages/share`.  Also see `lib/share` and `components/share` for code specific to the share server.