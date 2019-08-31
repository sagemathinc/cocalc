import { React, Rendered, Component } from "../app-framework";

/* This is a TERRIBLE AD INFESTED DISASTER. It's way too embarassing to deploy. */

/*
export class GoogleCustomSearch extends Component {
  public render(): Rendered {
    return (
      <div>
        <script
          async
          src="https://cse.google.com/cse.js?cx=012730276268788167083:sruemc2v3tk"
        />
        <div className="gcse-search" />
      </div>
    );
  }
}
*/

/*
This is much better quality overall, at least if a user has their own ad blocker
installed.  Otherwise, it's still at least consistent with what they are used to.

Example URL:

https://www.google.com/search?q=site%3Ashare.cocalc.com+julia+sage
*/

export class SiteSearch extends Component {
  private html(): string {
    return `
<script>
function cocalc_do_search(event) {
  const e = window.event;
  if(e && e.keyCode && e.keyCode != 13) return;
  const value = document.getElementById('cocalc-search-input').value;
  window.location.href = 'https://www.google.com/search?q=site%3A' + window.location.host + '+' + value ;
}
</script>
<input type="text" id="cocalc-search-input" onkeydown="cocalc_do_search()""> <button onclick="cocalc_do_search()">🔍 Search CoCalc</button>
`;
  }

  public render(): Rendered {
    return <div style={{padding:'5px'}} dangerouslySetInnerHTML={{ __html: this.html() }} />;
  }
}
