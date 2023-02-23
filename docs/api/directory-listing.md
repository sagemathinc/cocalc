# Using the CoCalc API to get directory listings for a project via the database

We assume you can do a basic query as explained in [purchasing\-licenses.md](./purchasing-licenses.md).

As you browse directories and work with files, CoCalc computes \(and regularly updates\) the directory listings for those files.  It stores the listings in the central PostgreSQL database.  These listings are available to very quickly query _**even if the project is not running**_.  Moreover, as explained below, you can also do a single query to get listings for all paths that users have explicitly browsed, which is more efficient than tedious walking the directory tree.

**Caveat:** the directory listings you get via the database reflect the state of the project when a user last expressed interest in that directory.  If you use, e.g., rsync or an api call to copy a file into a project, don't expect the directory listing you get via the method here to necessarily have that file in it.

## Directory listing for a given path

Here we show you how to get the directory listing for `path` in `project_id` via a user\_query to the database.  Obviously, the project\_id and path you give below may be different.  The path should be relatively to the HOME directory, e.g., "path":"" is the HOME directory:

```sh
curl -sk -u $key: -H 'Content-Type: application/json' \
   -d '{"query":{"listings":{"project_id":"5ee8d3ca-b723-4fe5-a94e-dc8c62659886","path":"","listing":null}}}' \
   $url/user-query | jq
```

The above will output something like the following, but with your account\_id and email\_address replacing the ones below

```js
{
  "query": {
    "listings": {
      "project_id": "5ee8d3ca-b723-4fe5-a94e-dc8c62659886",
      "path": "",
      "listing": [
        {
          "name": ".ssh",
          "size": 2,
          "isdir": true,
          "mtime": 1677111163.888
        },          
        {
          "name": "2022-04-04-164144.ipynb",
          "size": 1809,
          "mtime": 1650036446.483
        },        
        {
          "name": "2022-04-16-160712.md",
          "size": 0,
          "mtime": 1650150434.384
        },
      ]
    }
  }
}
```

## Directory listings for all known paths at once

The following shows how to get _**all known directory listings for all paths**_ in a project.  This gives up to 25 distinct paths.

```sh
curl -sk -u $key: -H 'Content-Type: application/json' \
   -d '{"query":{"listings":[{"project_id":"5ee8d3ca-b723-4fe5-a94e-dc8c62659886","path":null,"listing":null}]}}' \
   $url/user-query | jq
```

