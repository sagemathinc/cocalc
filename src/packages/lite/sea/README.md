Self extracting single file compressed cocalc-lite executable based on
https://nodejs.org/api/single-executable-applications.html

ASSUMPTION:

- you have built `cocalc-lite.tar.gz`
- you have installed nvm.sh with node version 24

Then just run ./build.sh.

The resulting binary has no dependencies and will run without deps with a GLIBC from the last 5 years (so ubuntu 20.04 is fine, but not ubuntu 18.04).

E.g., running this in a lightweight docker:

```
docker run -v `pwd`:/x -it --rm ubuntu:20.04  /x/cocalc
```

---

-

Using this on a compute server.

scp it to root@[server]

Start it

Setup port forward to your laptop (e.g., using reflect-sync):

```sh
wstein@lite:~/build/sea/cocalc$ reflect forward create -n wdev 9000 root@35.212.230.72:42513 
Created session fwrd_R1STMVOKmnS2Q3W4ic0YP5slUOBpWvyJq96KQgYXMfw                
wstein@lite:~/build/sea/cocalc$ 
```

This should work for proxy.json to directly connect, but it isn't:

```
[
  {"path":"/","target":"http://localhost:42513"}
]
```

but we should just add ssl support and use this instead of that proxy.

