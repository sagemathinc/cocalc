import httpx
from typing import Any, Optional
from .util import api_method, handle_error
from .api_types import PingResponse


class Hub:

    def __init__(self, api_key: str, host: str = "https://cocalc.com"):
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
        payload: dict[str, Any] = {"name": name, "args": arguments}
        if timeout is not None:
            payload["timeout"] = timeout
        resp = self.client.post(self.host + '/api/conat/hub', json=payload)
        resp.raise_for_status()
        return handle_error(resp.json())

    @property
    def system(self):
        """Access system-level API functions."""
        return System(self)

    @property
    def projects(self):
        """Access project-related API functions."""
        return Projects(self)

    @property
    def jupyter(self):
        """Access jupyter-related API functions."""
        return Jupyter(self)


    @property
    def sync(self):
        """Access sync engine related functions."""
        return Sync(self)

class System:

    def __init__(self, parent: "Hub"):
        self._parent = parent

    @api_method("system.ping")
    def ping(self) -> PingResponse:
        """
        Ping the server.

        Returns:
            Any: JSON object containing the current server time.
        """
        raise NotImplementedError

    def get_names(self, account_ids: list[str]) -> list[str]:
        """
        Get the displayed names of CoCalc accounts with given IDs.

        Args:
            account_ids (list[str]): List of account UUID strings.

        Returns:
            Any: Mapping from account_id to profile information.
        """
        return self._parent.call("system.getNames", [account_ids])


class Projects:

    def __init__(self, parent: "Hub"):
        self._parent = parent

    @api_method("projects.copyPathBetweenProjects")
    def copy_path_between_projects(
        self,
        src_project_id: str,
        src_path: str,
        target_project_id: Optional[str] = None,
        target_path: Optional[str] = None,
    ):
        """
        Copy a path from one project to another (or within a project).

        Args:
            src_project_id (str): Source project ID.
            src_path (str): Path in the source project to copy.
            target_project_id (Optional[str]): Target project ID. Defaults to src_project_id.
            target_path (Optional[str]): Target path in the target project. Defaults to src_path.

        Returns:
            Any: JSON response indicating success or error.
        """
        ...

    @api_method("projects.createProject")
    def create_project(
        self,
        title: Optional[str] = None,
        description: Optional[str] = None,
        license: Optional[str] = None,
        public_path_id: Optional[str] = None,
    ) -> str:
        """
        Create a new project.

        Args:
            title (Optional[str]): Title of the project.
            description (Optional[str]): Description of the project.
            license (Optional[str]): License ID (or multiple IDs separated by commas).
            public_path_id (Optional[str]): If provided, project is populated with content from this shared path.

        Returns:
            str: The ID of the newly created project.
        """
        # actually implemented via the decorator
        raise NotImplementedError

    @api_method("projects.addCollaborator", opts=True)
    def add_collaborator(self, project_id: str | list[str],
                         account_id: str | list[str]):
        """
        Add a collaborator to a project.

        Args:
            project_id (str | list[str]): Project ID(s) to add a collaborator to.
            account_id (str | list[str]): Account ID(s) of the collaborator(s).

        Note:
            You can pass arrays of the same length for `project_id` and `account_id` to
            add several collaborators at once. In this case, `account_id[i]` is added to
            `project_id[i]`.

        Returns:
            Any: JSON response from the API.
        """
        ...

    @api_method("projects.removeCollaborator", opts=True)
    def remove_collaborator(self, project_id: str, account_id: str):
        """
        Remove a collaborator from a project.

        Args:
            project_id (str): The project to remove a user from.
            account_id (str): Account ID of the user to remove.

        Returns:
            Any: JSON response from the API.
        """
        ...


class Jupyter:

    def __init__(self, parent: "Hub"):
        self._parent = parent

    @api_method("jupyter.kernels")
    def kernels(self, project_id: Optional[str] = None):
        """
        Get specifications of available Jupyter kernels.

        Args:
            project_id (Optional[str]): If provided, return kernel specs for this project.
                If not given, a global anonymous project may be used.

        Returns:
            Any: JSON response containing kernel specs.
        """
        ...

    @api_method("jupyter.execute")
    def execute(
        self,
        input: str,
        kernel: str,
        history: Optional[list[str]] = None,
        project_id: Optional[str] = None,
        path: Optional[str] = None,
    ):
        """
        Execute code using a Jupyter kernel.

        Args:
            input (str): Code to execute.
            kernel (Optional[str]): Name of kernel to use. Get options using jupyter.kernels()
            history (Optional[list[str]]): Array of previous inputs (they get evaluated every time, but without output being captured).
            project_id (Optional[str]): Project in which to run the code -- if not given, global anonymous project is used, if available.
            path (Optional[str]): File path context for execution.

        Returns:
            Any: JSON response containing execution results.
            
        Examples:
            Execute a simple sum using a Jupyter kernel:
            
            >>> import cocalc_api;  hub = cocalc_api.Hub(api_key="sk-...")
            >>> hub.jupyter.execute(history=['a=100;print(a)'], 
                           input='sum(range(a+1))',
                           kernel='python3')
            {'output': [{'data': {'text/plain': '5050'}}], ...}
            
            Factor a number using the sagemath kernel in a specific project:
            
            >>> hub.jupyter.execute(history=['a=2025'], input='factor(a)', kernel='sagemath', 
            ...     project_id='6e75dbf1-0342-4249-9dce-6b21648656e9')
            {'output': [{'data': {'text/plain': '3^4 * 5^2'}}], ...}
        """
        ...
        
        

class Sync:

    def __init__(self, parent: "Hub"):
        self._parent = parent

    @api_method("sync.history")
    def history(self, project_id: str, path:str):
        """
        Get complete edit history of a file.

        Args:
            project_id (str): The project_id of the project containing the file.
            path (str): The path to the file.

        Returns:
            Any: Array of patches in a compressed diff-match-patch format, along with time and user data.
        """
        ...

