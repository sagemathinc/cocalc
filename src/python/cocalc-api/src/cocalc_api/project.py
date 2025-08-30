import httpx
from typing import Any, Optional
from .util import api_method, handle_error
from .api_types import ExecuteCodeOutput, PingResponse


class Project:

    def __init__(self,
                 api_key: str,
                 host: str = "https://cocalc.com",
                 project_id: Optional[str] = None):
        self.project_id = project_id
        self.api_key = api_key
        self.host = host
        self.client = httpx.Client(
            auth=(api_key, ""), headers={"Content-Type": "application/json"})

    def call(self,
             name: str,
             arguments: list[Any],
             timeout: Optional[int] = None) -> Any:
        """
        Perform an API call to the CoCalc backend.

        Args:
            name (str): The remote function name to invoke (e.g. "system.ping").
            arguments (list[Any]): Arguments to pass to the remote function.
            timeout (Optional[int]): Timeout in milliseconds. Defaults to None.

        Returns:
            Any: JSON-decoded response from the API.
        """
        payload: dict[str, Any] = {
            "name": name,
            "args": arguments,
            "project_id": self.project_id
        }
        if timeout is not None:
            payload["timeout"] = timeout
        resp = self.client.post(self.host + '/api/conat/project', json=payload)
        resp.raise_for_status()
        return handle_error(resp.json())

    @property
    def system(self):
        """Access system-level API functions."""
        return System(self)


class System:

    def __init__(self, parent: "Project"):
        self._parent = parent

    @api_method("system.ping")
    def ping(self) -> PingResponse:
        """
        Ping the project.

        Returns:
            Any: JSON object containing the current server time.

        Examples:
            Ping a project.  The api_key can be either an account api key or a project
            specific api key (in which case the project_id option is optional):

            >>> import cocalc_api;  project = cocalc_api.Project(api_key="sk-...", project_id='...')
            >>> project.ping()
            {'now': 1756489740133}

        """
        raise NotImplementedError

    @api_method("system.exec", timeout_seconds=True)
    def exec(
        self,
        command: str,
        args: Optional[list[str]] = None,
        path: Optional[str] = None,
        cwd: Optional[str] = None,
        timeout: Optional[int] = None,
        max_output: Optional[int] = None,
        bash: Optional[bool] = None,
        env: Optional[dict[str, Any]] = None,
        async_call: Optional[bool] = None,
        compute_server_id: Optional[int] = None,
    ) -> ExecuteCodeOutput:
        """
        Execute an arbitrary shell command in the project.

        Args:

            command (str): command to run; can be a program name (e.g., "ls") or absolute path, or a full bash script
            args (Optional[list[str]]): optional arguments to the command
            path (Optional[str]): path (relative to HOME directory) where command will be run
            cwd (Optional[str]): absolute path where code excuted from (if path not given)
            timeout (Optional[int]): optional timeout in SECONDS
            max_output (Optional[int]): bound on size of stdout and stderr; further output ignored
            bash (Optional[bool]): if True, ignore args and evaluate command as a bash command
            env (Optional[dict[str, Any]]): if given, added to exec environment
            compute_server_id (Optional[number]): compute server to run code on (instead of home base project)

        Returns:
            ExecuteCodeOutput: Result of executing the command.

        Notes:
            The returned `ExecuteCodeOutput` has the following fields:

            - `stdout` (str): Output written to stdout.
            - `stderr` (str): Output written to stderr.
            - `exit_code` (int): Exit code of the process.


        Examples:

            >>> import cocalc_api
            >>> project = cocalc_api.Project(api_key="sk-...",
                             project_id='6e75dbf1-0342-4249-9dce-6b21648656e9')
            >>> project.system.exec(command="echo 'hello from cocalc'")
            {'stdout': 'hello from cocalc\\n', 'stderr':'', 'exit_code': 0}
        """
        raise NotImplementedError

    @api_method("system.jupyterExecute")
    def jupyter_execute(
        self,
        input: str,
        kernel: str,
        history: Optional[list[str]] = None,
        path: Optional[str] = None,
    ):
        """
        Execute code using a Jupyter kernel.

        Args:
            input (str): Code to execute.
            kernel (Optional[str]): Name of kernel to use. Get options using jupyter.kernels()
            history (Optional[list[str]]): Array of previous inputs (they get evaluated every time, but without output being captured).
            path (Optional[str]): File path context for execution.

        Returns:
            Any: JSON response containing execution results.

        Examples:
            Execute a simple sum using a Jupyter kernel:

            >>> import cocalc_api;  project = cocalc_api.Project(api_key="sk-...")
            >>> project.jupyter.execute(history=['a=100;print(a)'],
                         input='sum(range(a+1))',
                         kernel='python3')
            {'output': [{'data': {'text/plain': '5050'}}], ...}
        """
        ...
