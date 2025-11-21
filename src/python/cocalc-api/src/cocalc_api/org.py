from typing import Any, Optional, TYPE_CHECKING
from .util import api_method
from .api_types import TokenType, OrganizationUser

if TYPE_CHECKING:  # pragma: no cover
    from .hub import Hub


class Organizations:

    def __init__(self, parent: "Hub"):
        self._parent = parent

    @api_method("org.getAll")
    def get_all(self) -> dict[str, Any]:
        """
        Get all organizations (site admins only).

        Returns:
            dict[str, Any]: Organization data.
        """
        ...  # pragma: no cover

    @api_method("org.create")
    def create(self, name: str) -> dict[str, Any]:
        """
        Create an organization (site admins only).

        Args:
            name (str): Name of the organization; must be globally unique,
                at most 39 characters, and CANNOT BE CHANGED.

        Returns:
            dict[str, Any]: Organization data.
        """
        ...  # pragma: no cover

    @api_method("org.get")
    def get(self, name: str) -> dict[str, Any]:
        """
        Get an organization.

        Args:
            name (str): Name of the organization.

        Returns:
            dict[str, Any]: Organization data.
        """
        ...  # pragma: no cover

    @api_method("org.set")
    def set(self,
            name: str,
            title: Optional[str] = None,
            description: Optional[str] = None,
            email_address: Optional[str] = None,
            link: Optional[str] = None) -> dict[str, Any]:
        """
        Set properties of an organization.

        Args:
            name (str): Name of the organization.
            title (Optional[str]): The title of the organization.
            description (Optional[str]): Description of the organization.
            email_address (Optional[str]): Email address to reach the organization
                (nothing to do with a cocalc account).
            link (Optional[str]): A website of the organization.
        """
        ...  # pragma: no cover

    @api_method("org.addAdmin")
    def add_admin(self, name: str, user: str) -> dict[str, Any]:
        """
        Make the user with given account_id or email an admin
        of the named organization.

        Args:
            name (str): name of the organization
            user (str): email or account_id
        """
        ...  # pragma: no cover

    @api_method("org.addUser")
    def add_user(self, name: str, user: str) -> dict[str, Any]:
        """
        Make the user with given account_id or email a member
        of the named organization. Only site admins can do this.
        If you are an org admin, instead use user to create
        new users in your organization, or contact support.

        Args:
            name (str): name of the organization
            user (str): email or account_id
        """
        ...  # pragma: no cover

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
        ...  # pragma: no cover

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
        ...  # pragma: no cover

    @api_method("org.expireToken")
    def expire_token(self, token: str) -> dict[str, Any]:
        """
        Immediately expire a token created using create_token.

        Args:
            token (str): a token
        """
        ...  # pragma: no cover

    @api_method("org.getUsers")
    def get_users(self, name: str) -> list[OrganizationUser]:  # type: ignore[empty-body]
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
        ...  # pragma: no cover

    @api_method("org.removeUser")
    def remove_user(self, name: str, user: str) -> dict[str, Any]:
        """
        Remove a user from an organization.

        Args:
            name (str): name of the organization
            user (str): email or account_id
        """
        ...  # pragma: no cover

    @api_method("org.removeAdmin")
    def remove_admin(self, name: str, user: str) -> dict[str, Any]:
        """
        Remove an admin from an organization.

        Args:
            name (str): name of the organization
            user (str): email or account_id
        """
        ...  # pragma: no cover

    @api_method("org.message")
    def message(self, name: str, subject: str, body: str) -> dict[str, Any]:
        """
        Send a message from you to every account that is a member of
        the named organization.

        Args:
            name (str): name of the organization
            subject (str): plain text subject of the message
            body (str): markdown body of the message (math typesetting works)
        """
        ...  # pragma: no cover
