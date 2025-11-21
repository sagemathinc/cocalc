import httpx
from typing import Any, Optional
from .util import api_method, handle_error
from .api_types import ExecuteCodeOutput, PingResponse


class Project:

    def __init__(self, api_key: str, host: str = "https://cocalc.com", project_id: Optional[str] = None):
        self.project_id = project_id
        self.api_key = api_key
        self.host = host
        # Use longer timeout for API calls (120 seconds to handle slow kernel startups in CI)
        self.client = httpx.Client(auth=(api_key, ""), headers={"Content-Type": "application/json"}, timeout=120.0)

    def call(self, name: str, arguments: list[Any], timeout: Optional[int] = None) -> Any:
        """
        Perform an API call to the CoCalc backend.

        Args:
            name (str): The remote function name to invoke (e.g. "system.ping").
            arguments (list[Any]): Arguments to pass to the remote function.
            timeout (Optional[int]): Timeout in milliseconds. Defaults to None.

        Returns:
            Any: JSON-decoded response from the API.
        """
        payload: dict[str, Any] = {"name": name, "args": arguments}
        # Only include project_id if it's not empty. For project-scoped API keys,
        # the project_id is extracted from the key itself by the backend.
        if self.project_id:
            payload["project_id"] = self.project_id
        if timeout is not None:
            payload["timeout"] = timeout
        resp = self.client.post(self.host + "/api/conat/project", json=payload)
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
            PingResponse: JSON object containing the current server time.

        Examples:
            Ping a project. The api_key can be either an account api key or a project
            specific api key (in which case the project_id option is optional):

            >>> import cocalc_api; project = cocalc_api.Project(api_key="sk-...", project_id='...')
            >>> project.ping()
            {'now': 1756489740133}

        """
        ...  # pragma: no cover

    @api_method("system.test")
    def test(self) -> dict[str, Any]:
        """
        Test the API key and get the project_id.

        Returns:
            dict: JSON object containing project_id and server_time.

        """
        ...  # pragma: no cover

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
            command (str): Command to run; can be a program name (e.g., "ls") or absolute path, or a full bash script.
            args (Optional[list[str]]): Optional arguments to the command.
            path (Optional[str]): Path (relative to HOME directory) where command will be run.
            cwd (Optional[str]): Absolute path where code executed from (if path not given).
            timeout (Optional[int]): Optional timeout in SECONDS.
            max_output (Optional[int]): Bound on size of stdout and stderr; further output ignored.
            bash (Optional[bool]): If True, ignore args and evaluate command as a bash command.
            env (Optional[dict[str, Any]]): If given, added to exec environment.
            compute_server_id (Optional[int]): Compute server to run code on (instead of home base project).

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
            ...                              project_id='6e75dbf1-0342-4249-9dce-6b21648656e9')
            >>> project.system.exec(command="echo 'hello from cocalc'")
            {'stdout': 'hello from cocalc\\n', 'stderr':'', 'exit_code': 0}
        """
        ...  # pragma: no cover

    @api_method("system.jupyterExecute", timeout_seconds=True)
    def jupyter_execute(
        self,
        input: str,
        kernel: str,
        history: Optional[list[str]] = None,
        path: Optional[str] = None,
        timeout: Optional[int] = 90,
    ) -> list[dict[str, Any]]:  # type: ignore[empty-body]
        """
        Execute code using a Jupyter kernel.

        Args:
            input (str): Code to execute.
            kernel (str): Name of kernel to use. Get options using hub.jupyter.kernels().
            history (Optional[list[str]]): Array of previous inputs (they get evaluated every time, but without output being captured).
            path (Optional[str]): File path context for execution.
            timeout (Optional[int]): Timeout in SECONDS for the execute call (defaults to 90 seconds).

        Returns:
            list[dict[str, Any]]: List of output items. Each output item contains
                execution results with 'data' field containing output by MIME type
                (e.g., 'text/plain' for text output) or 'name'/'text' fields for
                stream output (stdout/stderr).

        Examples:
            Execute a simple sum using a Jupyter kernel:

            >>> import cocalc_api; project = cocalc_api.Project(api_key="sk-...", project_id='...')
            >>> result = project.system.jupyter_execute(input='sum(range(100))', kernel='python3')
            >>> result
            [{'data': {'text/plain': '4950'}}]

            Execute with history context:

            >>> result = project.system.jupyter_execute(
            ...     history=['a = 100'],
            ...     input='sum(range(a + 1))',
            ...     kernel='python3')
            >>> result
            [{'data': {'text/plain': '5050'}}]

            Print statements produce stream output:

            >>> result = project.system.jupyter_execute(input='print("Hello")', kernel='python3')
            >>> result
            [{'name': 'stdout', 'text': 'Hello\\n'}]
        """
        ...  # pragma: no cover

    @api_method("system.listJupyterKernels")
    def list_jupyter_kernels(self) -> list[dict[str, Any]]:  # type: ignore[empty-body]
        """
        List all running Jupyter kernels in the project.

        Returns:
            list[dict[str, Any]]: List of running kernels. Each kernel has:
                - pid (int): Process ID of the kernel
                - connectionFile (str): Path to the kernel connection file
                - kernel_name (str, optional): Name of the kernel (e.g., 'python3')

        Examples:
            List all running kernels:

            >>> import cocalc_api; project = cocalc_api.Project(api_key="sk-...", project_id='...')
            >>> kernels = project.system.list_jupyter_kernels()
            >>> kernels
            [{'pid': 12345, 'connectionFile': '/run/user/1000/jupyter/kernel-abc123.json', 'kernel_name': 'python3'}]
        """
        ...  # pragma: no cover

    @api_method("system.stopJupyterKernel")
    def stop_jupyter_kernel(self, pid: int) -> dict[str, bool]:  # type: ignore[empty-body]
        """
        Stop a specific Jupyter kernel by process ID.

        Args:
            pid (int): Process ID of the kernel to stop

        Returns:
            dict[str, bool]: Dictionary with 'success' key indicating if the kernel was stopped

        Examples:
            Stop a kernel by PID:

            >>> import cocalc_api; project = cocalc_api.Project(api_key="sk-...", project_id='...')
            >>> project.system.stop_jupyter_kernel(pid=12345)
            {'success': True}
        """
        ...  # pragma: no cover
