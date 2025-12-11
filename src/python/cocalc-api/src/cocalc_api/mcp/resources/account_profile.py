"""
Account profile resource for account-scoped API keys.

Provides the 'account-profile' resource that returns read-only information
about the current user account, including name, email, settings, etc.
"""

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    pass


def register_account_profile_resource(mcp) -> None:
    """Register the account profile resource with the given FastMCP instance."""

    @mcp.resource("cocalc://account-profile")
    def account_profile() -> str:
        """
        Get read-only profile information about your CoCalc account.

        Use this resource to:
        - View your profile, i.e. account name, email, and personal information
        - Check your editor and terminal settings
        - Understand your account configuration and preferences
        - See when your account was created and last active

        Returns account information including:
        - Personal info (first_name, last_name, email_address, account_id)
        - Settings (editor_settings, other_settings, terminal preferences)
        - Account metadata (created, last_active, balance, groups)
        - Profile customizations
        """
        try:
            # Import configuration from mcp_server
            from ..mcp_server import _api_key, _host, _api_key_scope
            from cocalc_api import Hub

            if not _api_key_scope or "account_id" not in _api_key_scope:
                return "Error: This resource requires an account-scoped API key"

            if not _api_key or not _host:
                return "Error: API configuration not initialized"

            hub = Hub(api_key=_api_key, host=_host)

            # Query account information from the database
            account_data = hub.db.query({
                "accounts": {
                    "account_id": None,
                    "first_name": None,
                    "last_name": None,
                    "email_address": None,
                    "name": None,
                    "created": None,
                    "last_active": None,
                    "balance": None,
                    "groups": None,
                    "editor_settings": None,
                    "other_settings": None,
                    "terminal": None,
                    "autosave": None,
                    "font_size": None,
                    "profile": None,
                }
            })

            if not account_data or "accounts" not in account_data:
                return "Error: Could not retrieve account information"

            account_info = account_data["accounts"]

            # Format the output nicely
            output = []
            output.append("=" * 70)
            output.append("ACCOUNT PROFILE")
            output.append("=" * 70)

            # Personal Information
            output.append("\nPERSONAL INFORMATION")
            output.append("-" * 70)
            output.append(f"Account ID:     {account_info.get('account_id', 'N/A')}")
            output.append(f"First Name:     {account_info.get('first_name', '')}")
            output.append(f"Last Name:      {account_info.get('last_name', '')}")
            output.append(f"Username:       {account_info.get('name', 'Not set')}")
            output.append(f"Email Address:  {account_info.get('email_address', 'Not set')}")

            # Account Metadata
            output.append("\nACCOUNT METADATA")
            output.append("-" * 70)
            created = account_info.get('created')
            if created:
                output.append(f"Created:        {created}")
            last_active = account_info.get('last_active')
            if last_active:
                output.append(f"Last Active:    {last_active}")
            balance = account_info.get('balance')
            if balance is not None:
                output.append(f"Account Balance: ${balance:.2f}")
            groups = account_info.get('groups', [])
            if groups:
                output.append(f"Groups:         {', '.join(groups)}")

            # Editor Settings
            editor_settings = account_info.get('editor_settings', {})
            if editor_settings:
                output.append("\nEDITOR SETTINGS")
                output.append("-" * 70)
                output.append(f"Theme:          {editor_settings.get('theme', 'default')}")
                output.append(f"Bindings:       {editor_settings.get('bindings', 'standard')}")
                output.append(f"Font Size:      {editor_settings.get('font_size', 'default')}")
                output.append(f"Line Numbers:   {editor_settings.get('line_numbers', True)}")
                output.append(f"Line Wrapping:  {editor_settings.get('line_wrapping', True)}")

            # Other Settings
            other_settings = account_info.get('other_settings', {})
            if other_settings:
                output.append("\nOTHER SETTINGS")
                output.append("-" * 70)
                output.append(f"Dark Mode:      {other_settings.get('dark_mode', False)}")
                output.append(f"KaTeX Enabled:  {other_settings.get('katex', True)}")
                output.append(f"Language:       {other_settings.get('i18n', 'en')}")

            # Terminal Settings
            terminal = account_info.get('terminal', {})
            if terminal:
                output.append("\nTERMINAL SETTINGS")
                output.append("-" * 70)
                output.append(f"Font Size:      {terminal.get('font_size', 14)}")
                output.append(f"Color Scheme:   {terminal.get('color_scheme', 'default')}")
                output.append(f"Font:           {terminal.get('font', 'monospace')}")

            output.append("\n" + "=" * 70)

            return "\n".join(output)

        except Exception as e:
            return f"Error retrieving account profile: {str(e)}"
