// Just enough for display to the user:
export interface Strategy {
  name: string;
  display: string; // name to display for SSO
  icon: string; // name of or URL to icon to display for SSO
  backgroundColor: string; // background color for icon, if not a link
  public: boolean; // true for general broad audiences, like google
}
