# CoCalc Python API Client

Install the Python client API `cocalc-api` that is [hosted on Pypi](https://pypi.org/project/cocalc-api/).

```sh
pip install cocalc-api
```

Obtain a [CoCalc account API Key](https://doc.cocalc.com/apikeys.html) by going to [your account preferences](https://cocalc.com/settings/account) and scrolling down to "Api Keys", then start using CoCalc from your Python scripts. This API is mostly for account level API keys, but it also provides some minimal support for project specific API keys.

Using an account level API key, the cocalc_api Python library enabled you to do all of the following very easily from a Python script:

- [search](api/system.md) for other cocalc users by name or email address, and get the name associated to an account_id
- list [your projects](api/projects.md), add and remove collaborators, copy files between projects and create, start, stop and delete projects.
- use the [Jupyter API](api/jupyter.md) to list available kernels and evaluate code using a kernel, either in an anonymous sandbox or in one of your projects.
- read or write any data you have access to in the CoCalc [PostgreSQL database](api/database.md), as defined by [this schema](https://github.com/sagemathinc/cocalc/tree/master/src/packages/util/db-schema).
- instantly send and receive [messages](api/messages.md) with any other cocalc users
- create and manage users in an [organization](api/organizations.md), including automatically generating authentication links, so you're users do not have explicitly create a CoCalc account. You can see when they are active and send them messages.

Currently a project specific API key can be used to:

- Run [shell commands](api/project.md) and Jupyter code in a specific project, and manage running Jupyter kernels (list and stop).
