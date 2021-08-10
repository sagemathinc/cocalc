# The Share Server

This is a next.js app, which is used as part of CoCalc to provide the share server.

To develop the share server, mostly just edit code here and it will automatically reload (hot module reloading) without you having to refresh the page. As long as you're not changing basic configuration, you don't have to restart the hub.

You don't need to start your own nextjs server here -- the hub handles that.

## Using the lib code from other packages

The file `tsconfig-dist.json` is for building the `lib/` code sothat it can be used from other node.js modules, in addition to being consumedby webpack via nextjs. In particular, @cocalc/hub uses this to load initializethe share server, and also to send raw requests to the raw handler.More generally, this means that code written as part of @cocalc/sharecan be used in other places, which is generally a good thing.You might have to add to the `exports` section of package.json,or adjust `tsconfig-dist.json` to better align with `tsconfig.json` (which is used as part of webpack and nextjs).

```sh
npm run build-dist
```

NOTE: we export this code so it is usable via importing from `@cocalc/share/lib/*`, i.e., we keep the `lib` explicit, just in case we add another module similar to `lib`.
