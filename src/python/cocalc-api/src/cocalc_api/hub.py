import httpx
from typing import Any, Literal, Optional
from .util import api_method, handle_error
from .api_types import PingResponse, UserSearchResult, MessageType, TokenType, OrganizationUser


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

    @api_method("system.userSearch")
    def user_search(self, query: str) -> UserSearchResult:
        """
        Search for existing users by name or email address.

        Args:
            query (str): A query, e.g., partial name, email address, etc.

        Returns:
            list[UserSearchResult]: array of dicts with account_id, name,
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

             >>>  hub.system.user_search('wstein@gmail.com')
            [{'account_id': 'd0bdabfd-850e-4c8d-8510-f6f1ecb9a5eb',
              'first_name': 'W',
              'last_name': 'Stein',
              'name': None,
              'email_address': 'wstein@gmail.com',
              'last_active': 1756503700052,
              'created': 1756056224470,
              'email_address_verified': None}]
        """
        raise NotImplementedError


class Projects:

    def __init__(self, parent: "Hub"):
        self._parent = parent

    def get(self,
            fields: Optional[list[str]] = None,
            all: Optional[bool] = False,
            project_id: Optional[str] = None):
        """
        Get data about projects that you are a collaborator on.  Only gets
        recent projects by default; set all=True to get all projects.

        Args:
            fields (Optional[list[str]]): the fields about the project to get.
                default: ['project_id', 'title', 'last_edited', 'state'], but see
                https://github.com/sagemathinc/cocalc/blob/master/src/packages/util/db-schema/projects.ts
            all (Optional[bool]): if True, return ALL your projects,
                not just the recent ones. False by default.
            project_id (Optional[string]): if given as a project_id, gets just the
                one project (as a length of length 1).

        Returns:
            list[dict[str,Any]]: list of projects
        """
        if fields is None:
            fields = ['project_id', 'title', 'last_edited', 'state']
        v: list[dict[str, Any]] = [{}]
        for field in fields:
            v[0][field] = None
        if project_id:
            v[0]['project_id'] = project_id
        query: dict[str, list[dict[str, None]]] = {}
        table = 'projects_all' if all else 'projects'
        query[table] = v
        result = self._parent.db.query(query)
        return result[table]

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

    @api_method("projects.start")
    def start(self, project_id: str):
        """
        Start a project.

        Args:
            project_id (str): project_id of the project to start
        """
        ...

    @api_method("projects.stop")
    def stop(self, project_id: str):
        """
        Stop a project.

        Args:
            project_id (str): project_id of the project to stop
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
    def history(self, project_id: str, path: str):
        """
        Get complete edit history of a file.

        Args:
            project_id (str): The project_id of the project containing the file.
            path (str): The path to the file.

        Returns:
            Any: Array of patches in a compressed diff-match-patch format, along with time and user data.
        """
        ...


class Database:

    def __init__(self, parent: "Hub"):
        self._parent = parent

    @api_method("db.userQuery")
    def query(self, query: dict[str, Any]) -> dict[str, Any]:
        """
        Do a user query.  The input is of one of the following forms, where the tables are defined at
        https://github.com/sagemathinc/cocalc/tree/master/src/packages/util/db-schema

        - `{"table-name":{"key":"value", ...}}`  with no None values sets one record in the database
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
        raise NotImplementedError


class Messages:

    def __init__(self, parent: "Hub"):
        self._parent = parent

    @api_method("messages.send")
    def send(self,
             subject: str,
             body: str,
             to_ids: list[str],
             reply_id: Optional[int] = None) -> int:
        """
        Send a message to one or more users.

        Args:
            subject (str): short plain text subject of the message
            body (str): Longer markdown body of the message (math typesetting and cocalc links work)
            to_ids (list[str]): email addresses or account_id of each recipients
            reply_id (Optional[int]): optional message you're replying to (for threading)

        Returns:
            int: id of the message
        """
        raise NotImplementedError

    @api_method("messages.get")
    def get(
        self,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
        type: Optional[Literal["received", "sent", "new", "starred",
                               "liked"]] = None,
    ) -> list[MessageType]:
        """
        Get your messages.
        """
        raise NotImplementedError


"""
  message: authFirst,
  removeUser: authFirst,
  removeAdmin: authFirst,
  """


class Organizations:

    def __init__(self, parent: "Hub"):
        self._parent = parent

    @api_method("org.getAll")
    def get_all(self):
        """
        Get all organizations (site admins only).

        Returns:
            Any: ...
        """
        raise NotImplementedError

    @api_method("org.create")
    def create(self, name: str):
        """
        Create an organization (site admins only).

        Args:
            name (str) - name of the organization; must be globally unique,
                at most 39 characters, and CANNOT BE CHANGED

        Returns:
            Any: ...
        """
        raise NotImplementedError

    @api_method("org.get")
    def get(self, name: str):
        """
        Get an organization

        Args:
            name (str) - name of the organization

        Returns:
            Any: ...
        """
        raise NotImplementedError

    @api_method("org.set")
    def set(self,
            name: str,
            title: Optional[str] = None,
            description: Optional[str] = None,
            email_address: Optional[str] = None,
            link: Optional[str] = None):
        """
        Set properties of an organization.

        Args:
            name (str): name of the organization
            title (Optional[str]): the title of the organization
            description (Optional[str]): description of the organization
            email_address (Optional[str]): email address to reach the organization
               (nothing to do with a cocalc account)
            link (Optional[str]): a website of the organization
        """
        raise NotImplementedError

    @api_method("org.addAdmin")
    def add_admin(self, name: str, user: str):
        """
        Make the user with given account_id or email an admin
        of the named organization.

        Args:
            name (str): name of the organization
            user (str): email or account_id
        """
        raise NotImplementedError

    @api_method("org.addUser")
    def add_user(self, name: str, user: str):
        """
        Make the user with given account_id or email a member
        of the named organization. Only site admins can do this.
        If you are an org admin, instead use create_user to create
        new users in your organization, or contact support.

        Args:
            name (str): name of the organization
            user (str): email or account_id
        """
        raise NotImplementedError

    @api_method("org.createUser")
    def create_user(self,
                    name: str,
                    email: str,
                    firstName: Optional[str] = None,
                    lastName: Optional[str] = None,
                    password: Optional[str] = None) -> str:
        """
        Create a new cocalc account that is a member of the
        named organization.

        Args:
            name (str): name of the organization
            email (str): email address
            firstName (Optional[str]): optional first name of the user
            lastName (Optional[str]): optional last name of the user
            password (Optional[str]): optional password (will be randomized if
                not given; you can instead use create_token to grant temporary
                account access).

        Returns:
            str: account_id of the new user
        """
        raise NotImplementedError

    @api_method("org.createToken")
    def create_token(self, user: str) -> TokenType:
        """
        Create a token that provides temporary access to the given
        account.  You must be an admin for the org that the user
        belongs to or a site admin.

        Args:
            user (str): email address or account_id

        Returns:
            TokenType: token that grants temporary access

        Notes:
            The returned `TokenType` has the following fields:

            - `token` (str): The random token itself, which you may retain
              in case you want to explicitly expire it early.
            - `url` (str): The url that the user should visit to sign in as
              them.  You can also test out this url, since the token works
              multiple times.
        """
        raise NotImplementedError

    @api_method("org.expireToken")
    def expire_token(self, token: str):
        """
        Immediately expire a token created using create_token.

        Args:
            token (str): a token
        """
        raise NotImplementedError

    @api_method("org.getUsers")
    def get_users(self, name: str) -> OrganizationUser:
        """
        Return list of all accounts that are members of the named organization.

        Args:
            name (str): name of the organization

        Returns:
            list[OrganizationUser]

        Notes:
            The returned `OrganizationUser` has the following fields:

            - `first_name` (str)
            - `last_name` (str)
            - `account_id` (str): a uuid
            - `email_address` (str)
        """
        raise NotImplementedError

    @api_method("org.message")
    def message(self, name: str, subject: str, body: str):
        """
        Send a message from you to every account that is a member of
        the named organization.

        Args:
            name (str): name of the organization
            subject (str): plain text subject of the message
            body (str): markdown body of the message (math typesetting works)
        """
