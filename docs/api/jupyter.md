# Using the CoCalc API to run code using any of our supported Jupyter kernels

You can use a CoCalc API key to evaluate code using any of our supported
kernels. [Get your API key in account config](https://cocalc.com/config/account/api).

Context: For more about CoCalc's API, see [https://doc.cocalc.com/api](https://doc.cocalc.com/api/index.html) and [https://doc.cocalc.com/api2.](https://doc.cocalc.com/api2/index.html)

## The Global Jupyter API Sandbox

https://cocalc.com has a pool of sandboxed projects that are
always running and available for you to evaluate code via the API.

### Available kernels

Get the available kernels at the https://cocalc.com/api/v2/jupyter/kernels endpoint.

```sh
curl https://cocalc.com/api/v2/jupyter/kernels
```

Result:

```json
{
  "kernels": [
    {
      "name": "bash",
      "display_name": "Bash (Linux)",
      "language": "bash",
      "env": { "PS1": "$" }
    ...}, ...
  ]
}
```

### Evaluate code

You can call any of the named kernels as follows:

```sh
export key=sk_.... # your api key (export assumes bash)
curl -sk -u $key: -H 'Content-Type: application/json' \
   -d '{"input":"print(2+3)","kernel":"python3"}' \
   https://cocalc.com/api/v2/jupyter/execute
```

Result:

```json
{
  "output": [{ "name": "stdout", "text": "5\n" }],
  "created": "2023-04-25T17:09:33.551Z",
  "success": true
}
```

When you use a kernel, a pool of pre\-started kernels is also warmed up in
sandboxed project so that future calls are quick.

Here's an example using SageMath:

```sh
export key=sk_.... # your api key (export assumes bash)
curl -sk -u $key: -H 'Content-Type: application/json' \
   -d '{"input":"factor(2023)","kernel":"sage-9.8"}' \
   https://cocalc.com/api/v2/jupyter/execute
```

Result:

```json
{
  "output": [{ "data": { "text/plain": "7 * 17^2" } }],
  "created": "2023-04-25T17:11:00.611Z",
  "success": true
}
```

You can also pass in history and then use it in the input:

```sh
export key=sk_.... # your api key (export assumes bash)
curl -sk -u $key: -H 'Content-Type: application/json' \
   -d '{"input":"print(a+b)","kernel":"python3","history":["a=2","b=3"]}' \
   https://cocalc.com/api/v2/jupyter/execute
```

Result:

```json
{
  "output": [{ "name": "stdout", "text": "5\n" }],
  "created": "2023-04-25T17:11:47.339Z",
  "success": true
}
```

## In Your Own Projects

You can also evaluate code using any Jupyter kernel in any of
your own projects. Note that this is potentially dangerous, since
running code can delete or access any data in that project.
When you use a kernel, a pool of pre-started kernels is also
warmed up in your project so that future calls are quick, until
the pool turns off.

The API is exactly the same as above, except you also pass in the `project_id`, and optionally a `path` where the code should run. That's it.

