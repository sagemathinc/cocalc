import httpx
from typing import Any, Literal, Optional
from .util import api_method, handle_error
from .api_types import PingResponse, TestResponse, UserSearchResult, MessageType
from .org import Organizations


class Hub:

    def __init__(self, api_key: str, host: str = "https://cocalc.com"):
        self.api_key = api_key
        self.host = host
        # Use longer timeout for API calls (120 seconds instead of default 5) to handle slow operations like Jupyter
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

    @property
    def db(self):
        """Access database state related functions."""
        return Database(self)

    @property
    def messages(self):
        """Sending and receiving messages."""
        return Messages(self)

    @property
    def org(self):
        """Managing organizations."""
        return Organizations(self)


class System:

    def __init__(self, parent: "Hub"):
        self._parent = parent

    @api_method("system.ping")
    def ping(self) -> PingResponse:
        """
        Ping the server.

        Returns:
            PingResponse: JSON object containing the current server time.
        """
        raise NotImplementedError

    @api_method("system.test")
    def test(self) -> TestResponse:
        """
        Test the API key and get its scope information.

        Returns:
            TestResponse: JSON object containing:
                - account_id (if account-scoped key)
                - project_id (if project-scoped key)
                - server_time (current server time in milliseconds since epoch)
        """
        raise NotImplementedError

    def get_names(self, account_ids: list[str]) -> list[str]:
        """
        Get the displayed names of CoCalc accounts with given IDs.

        Args:
            account_ids (list[str]): List of account UUID strings.

        Returns:
            list[str]: Mapping from account_id to profile information.
        """
        return self._parent.call("system.getNames", [account_ids])

    @api_method("system.userSearch")
    def user_search(self, query: str) -> UserSearchResult:
        """
        Search for existing users by name or email address.

        Args:
            query (str): A query, e.g., partial name, email address, etc.

        Returns:
            UserSearchResult: Array of dicts with account_id, name,
                first_name, last_name, last_active (in ms since epoch),
                created (in ms since epoch) and email_address_verified.

        Examples:
            Search for myself:

            >>> import cocalc_api; hub = cocalc_api.Hub(api_key="sk...")
            >>> hub.system.user_search('w')
            [{'account_id': 'd0bdabfd-850e-4c8d-8510-f6f1ecb9a5eb',
              'first_name': 'W',
              'last_name': 'Stein',
              'name': None,
              'last_active': 1756503700052,
              'created': 1756056224470,
              'email_address_verified': None}]

            You can search by email address to ONLY get the user
            that has that email address:

            >>> hub.system.user_search('wstein@gmail.com')
            [{'account_id': 'd0bdabfd-850e-4c8d-8510-f6f1ecb9a5eb',
              'first_name': 'W',
              'last_name': 'Stein',
              'name': None,
              'email_address': 'wstein@gmail.com',
              'last_active': 1756503700052,
              'created': 1756056224470,
              'email_address_verified': None}]
        """
        ...  # pragma: no cover


class Projects:

    def __init__(self, parent: "Hub"):
        self._parent = parent

    def get(
        self,
        fields: Optional[list[str]] = None,
        all: Optional[bool] = False,
        project_id: Optional[str] = None,
        limit: Optional[int] = None,
        deleted: Optional[bool] = None,
        hidden: Optional[bool] = None,
        state: Optional[str] = None,
        account_id_for_hidden: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        """
        Get data about projects that you are a collaborator on. Only gets
        recent projects by default; set all=True to get all projects.

        Args:
            fields (Optional[list[str]]): The fields about the project to get.
                Default: ['project_id', 'title', 'last_edited', 'created', 'state', 'deleted', 'users'], but see
                https://github.com/sagemathinc/cocalc/blob/master/src/packages/util/db-schema/projects.ts
            all (Optional[bool]): If True, return ALL your projects,
                not just the recent ones. False by default.
            project_id (Optional[str]): If given, gets just this
                one project (as a list of length 1).
            limit (Optional[int]): Maximum number of projects to return after filtering. None means no limit.
            deleted (Optional[bool]): If set, filter deleted status (True -> only deleted, False -> only not deleted).
            hidden (Optional[bool]): If set, filter by collaborator-specific hidden flag. Default None (no filter).
            state (Optional[str]): If set, only return projects whose state matches (e.g., 'opened', 'running').
            account_id_for_hidden (Optional[str]): Account ID used to evaluate the hidden flag in the users map.

        Returns:
            list[dict[str, Any]]: List of projects.
        """
        from datetime import datetime

        def _parse_ts(value: Any) -> float:
            if value is None:
                return 0.0
            if isinstance(value, (int, float)):
                return float(value)
            if isinstance(value, str):
                try:
                    return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
                except ValueError:
                    try:
                        return float(value)
                    except Exception:
                        return 0.0
            return 0.0

        def _state_str(val: Any) -> str:
            if isinstance(val, dict):
                return str(val.get("state") or val.get("status") or "")
            if val is None:
                return ""
            return str(val)

        if fields is None:
            fields = ['project_id', 'title', 'last_edited', 'created', 'state', 'deleted', 'users']
        v: list[dict[str, Any]] = [{}]
        for field in fields:
            v[0][field] = None
        if project_id:
            v[0]['project_id'] = project_id
        query: dict[str, list[dict[str, Any]]] = {}
        table = 'projects_all' if all else 'projects'
        query[table] = v
        result = self._parent.db.query(query)
        projects: list[dict[str, Any]] = result[table]

        filtered: list[dict[str, Any]] = []
        for project in projects:
            if deleted is not None:
                if bool(project.get("deleted")) != deleted:
                    continue

            if state:
                project_state = _state_str(project.get("state")).lower()
                if project_state != state.lower():
                    continue

            if hidden is not None and account_id_for_hidden:
                users = project.get("users") or {}
                if isinstance(users, dict):
                    user_info = users.get(account_id_for_hidden, {})
                    is_hidden = False
                    if isinstance(user_info, dict):
                        is_hidden = bool(user_info.get("hide"))
                    if is_hidden != hidden:
                        continue

            filtered.append(project)

        filtered.sort(
            key=lambda p: (
                _parse_ts(p.get("last_edited")),
                _parse_ts(p.get("created")),
                (p.get("title") or "").lower(),
                p.get("project_id") or "",
            ),
            reverse=True,
        )

        if limit is not None and limit >= 0:
            filtered = filtered[:limit]

        return filtered

    @api_method("projects.copyPathBetweenProjects")
    def copy_path_between_projects(
        self,
        src_project_id: str,
        src_path: str,
        target_project_id: Optional[str] = None,
        target_path: Optional[str] = None,
    ) -> dict[str, Any]:  # type: ignore[empty-body]
        """
        Copy a path from one project to another (or within a project).

        Args:
            src_project_id (str): Source project ID.
            src_path (str): Path in the source project to copy.
            target_project_id (Optional[str]): Target project ID. Defaults to src_project_id.
            target_path (Optional[str]): Target path in the target project. Defaults to src_path.

        Returns:
            dict[str, Any]: JSON response indicating success or error.
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
        ...

    @api_method("projects.addCollaborator", opts=True)
    def add_collaborator(self, project_id: str | list[str], account_id: str | list[str]) -> dict[str, Any]:
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
            dict[str, Any]: JSON response from the API.
        """
        ...  # pragma: no cover

    @api_method("projects.removeCollaborator", opts=True)
    def remove_collaborator(self, project_id: str, account_id: str) -> dict[str, Any]:
        """
        Remove a collaborator from a project.

        Args:
            project_id (str): The project to remove a user from.
            account_id (str): Account ID of the user to remove.

        Returns:
            dict[str, Any]: JSON response from the API.
        """
        ...  # pragma: no cover

    @api_method("projects.start")
    def start(self, project_id: str) -> dict[str, Any]:
        """
        Start a project.

        Args:
            project_id (str): Project ID of the project to start.
        """
        ...

    @api_method("projects.stop")
    def stop(self, project_id: str) -> dict[str, Any]:
        """
        Stop a project.

        Args:
            project_id (str): Project ID of the project to stop.
        """
        ...

    @api_method("projects.deleteProject")
    def delete(self, project_id: str) -> dict[str, Any]:
        """
        Delete a project by setting the deleted flag to true.

        Args:
            project_id (str): Project ID of the project to delete.

        Returns:
            dict[str, Any]: API response indicating success.
        """
        ...

    @api_method("projects.touch")
    def touch(self, project_id: str) -> dict[str, Any]:
        """
        Signal that the project is in use by updating its last_edited timestamp.
        This also ensures the project is started.

        Args:
            project_id (str): Project ID of the project to touch.

        Returns:
            dict[str, Any]: API response indicating success.
        """
        ...

    @api_method("projects.state")
    def state(self, project_id: str) -> dict[str, Any]:
        """
        Get the current state of a project (running, stopped, starting, etc.).

        Args:
            project_id (str): Project ID of the project.

        Returns:
            dict[str, Any]: Project state object containing:
                - state: "running" | "stopped" | "starting" | "restarting" | "error"
                - ip: IP address where project is running (if running)
                - error: Error message (if in error state)
                - time: Timestamp of last state change
        """
        ...

    @api_method("projects.status")
    def status(self, project_id: str) -> dict[str, Any]:
        """
        Get detailed status information about a project.

        Args:
            project_id (str): Project ID of the project.

        Returns:
            dict[str, Any]: Project status object containing:
                - project.pid: PID of project server process
                - start_ts: Timestamp when project started
                - version: Project code version
                - disk_MB: Disk usage in MB
                - memory: Memory usage information
        """
        ...


class Jupyter:

    def __init__(self, parent: "Hub"):
        self._parent = parent

    @api_method("jupyter.kernels")
    def kernels(self, project_id: Optional[str] = None) -> list[dict[str, Any]]:
        """
        Get specifications of available Jupyter kernels.

        Args:
            project_id (Optional[str]): If provided, return kernel specs for this project.
                If not given, a global anonymous project may be used.

        Returns:
            list[dict[str, Any]]: List of kernel specification objects. Each kernel object
                contains information like 'name', 'display_name', 'language', etc.

        Examples:
            Get available kernels for a project:

            >>> import cocalc_api; hub = cocalc_api.Hub(api_key="sk-...")
            >>> kernels = hub.jupyter.kernels(project_id='6e75dbf1-0342-4249-9dce-6b21648656e9')
            >>> # Extract kernel names
            >>> kernel_names = [k['name'] for k in kernels]
            >>> 'python3' in kernel_names
            True
        """
        ...  # pragma: no cover

    @api_method("jupyter.execute", timeout_seconds=True)
    def execute(
        self,
        input: str,
        kernel: str,
        history: Optional[list[str]] = None,
        project_id: Optional[str] = None,
        path: Optional[str] = None,
        timeout: Optional[int] = 90,
    ) -> dict[str, Any]:  # type: ignore[empty-body]
        """
        Execute code using a Jupyter kernel.

        Args:
            input (str): Code to execute.
            kernel (str): Name of kernel to use. Get options using jupyter.kernels().
            history (Optional[list[str]]): Array of previous inputs (they get evaluated every time, but without output being captured).
            project_id (Optional[str]): Project in which to run the code -- if not given, global anonymous project is used, if available.
            path (Optional[str]): File path context for execution.
            timeout (Optional[int]): Timeout in SECONDS for the execute call (defaults to 90 seconds).

        Returns:
            dict[str, Any]: JSON response containing execution results.

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
        ...  # pragma: no cover


class Sync:

    def __init__(self, parent: "Hub"):
        self._parent = parent

    @api_method("sync.history")
    def history(self, project_id: str, path: str) -> list[dict[str, Any]]:  # type: ignore[empty-body]
        """
        Get complete edit history of a file.

        Args:
            project_id (str): The project ID of the project containing the file.
            path (str): The path to the file.

        Returns:
            list[dict[str, Any]]: Array of patches in a compressed diff-match-patch format, along with time and user data.
        """
        ...  # pragma: no cover


class Database:

    def __init__(self, parent: "Hub"):
        self._parent = parent

    @api_method("db.userQuery")
    def query(self, query: dict[str, Any]) -> dict[str, Any]:
        """
        Do a user query. The input is of one of the following forms, where the tables are defined at
        https://github.com/sagemathinc/cocalc/tree/master/src/packages/util/db-schema

        - `{"table-name":{"key":"value", ...}}` with no None values sets one record in the database
        - `{"table-name":[{"key":"value", "key2":None...}]}` gets an array of all matching records
          in the database, filling in None's with the actual values.
        - `{"table-name:{"key":"value", "key2":None}}` gets one record, filling in None's with actual values.

        This is used for most configuration, e.g., user names, project descriptions, etc.

        Args:
            query (dict[str, Any]): Object that defines the query, as explained above.

        Examples:
            Get and also change your first name:

            >>> import cocalc_api; hub = cocalc_api.Hub(api_key="sk...")
            >>> hub.db.query({"accounts":{"first_name":None}})
            {'accounts': {'first_name': 'William'}}
            >>> hub.db.query({"accounts":{"first_name":"W"}})
            {}
            >>> hub.db.query({"accounts":{"first_name":None}})
            {'accounts': {'first_name': 'W'}}
        """
        ...  # pragma: no cover


class Messages:

    def __init__(self, parent: "Hub"):
        self._parent = parent

    @api_method("messages.send")
    def send(self, subject: str, body: str, to_ids: list[str], reply_id: Optional[int] = None) -> int:
        """
        Send a message to one or more users.

        Args:
            subject (str): Short plain text subject of the message.
            body (str): Longer markdown body of the message (math typesetting and cocalc links work).
            to_ids (list[str]): Email addresses or account_id of each recipient.
            reply_id (Optional[int]): Optional message you're replying to (for threading).

        Returns:
            int: ID of the message.
        """
        ...  # pragma: no cover

    @api_method("messages.get")
    def get(
        self,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
        type: Optional[Literal["received", "sent", "new", "starred", "liked"]] = None,
    ) -> list[MessageType]:  # type: ignore[empty-body]
        """
        Get your messages.

        Args:
            limit (Optional[int]): Maximum number of messages to return.
            offset (Optional[int]): Number of messages to skip.
            type (Optional[Literal]): Filter by message type.

        Returns:
            list[MessageType]: List of messages.
        """
        ...  # pragma: no cover


"""
message: authFirst,
removeUser: authFirst,
removeAdmin: authFirst,
"""
