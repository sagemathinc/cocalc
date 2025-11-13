Here's an example of how to use this API to connect to a project
and do some basic things. This communicates via HTTP via the
nextjs api.

NOTE: This is very new and not used by anything yet.

Set some environment variables. You'll have to get the API_KEY from
the settings of your project.

```sh
export PROJECT_ID=6640ddad-4bdd-4745-8e63-8db74686a20e
export API_KEY=sk-FcnRs3NxsTZROgbF000001
export API_SERVER=http://127.0.0.1:9001
```

The run code in node from the shell in the current directory:

```js
> a = require('@cocalc/api-client')

> await a.project.exec({project_id:process.env.PROJECT_ID, command:'ls -a'})

> await a.project.jupyterExec({project_id:process.env.PROJECT_ID, kernel:'python3-ubuntu', input:"import os; print('hi'*100, os.getpid())"})
```
