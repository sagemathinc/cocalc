import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Head from "components/landing/head";
import { Layout } from "antd";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import A from "components/misc/A";
import { MAX_WIDTH } from "lib/config";

export default function Privacy({ customize }) {
  return (
    <Customize value={customize}>
      <Head title="Privacy Policy" />
      <Layout>
        <Header page="policies" subPage="privacy" />
        <Layout.Content
          style={{
            backgroundColor: "white",
          }}
        >
          <div
            style={{
              maxWidth: MAX_WIDTH,
              margin: "15px auto",
              padding: "15px",
              backgroundColor: "white",
            }}
          >
            <div style={{ textAlign: "center", color: "#444" }}>
              <h1 style={{ fontSize: "28pt" }}>CoCalc - Privacy Policy</h1>
              <h2>Last Updated: October 3, 2025</h2>
            </div>
            <div style={{ fontSize: "12pt" }}>
              <p>
                Protecting your privacy is really important to us. With this in
                mind, we’re providing this Privacy Policy to explain our
                practices regarding the collection, use and disclosure of
                information that we receive through our Services. This Privacy
                Policy does not apply to any third-party websites, services or
                applications, even if they are accessible through our Services.
                Also, please note that, unless we define a term in this Privacy
                Policy, all capitalized terms used in this Privacy Policy have
                the same meanings as in our Terms of Service. So, please make
                sure that you have read and understand our Terms of
                Service.{" "}
              </p>
              <h1>Revisions to this Privacy Policy</h1>
              <p>
                Any information that is collected via our Services is covered by
                the Privacy Policy in effect at the time such information is
                collected. We may revise this Privacy Policy from time to time.
                If we make any material changes to this Privacy Policy, we’ll
                notify you of those changes by posting them on the Services or
                by sending you an email or other notification, and we’ll update
                the "Revision history" below to indicate when those changes will
                become effective.{" "}
              </p>
              <div id="purpose">
                <h1>1 Purpose</h1>
                <p>
                  This Privacy Policy is incorporated by reference into the
                  Sagemath Terms of Service (the <strong>“Terms”</strong>). The
                  terms <strong>“Sagemath”</strong>, <strong>“we”</strong>, and{" "}
                  <strong>“us”</strong> include Sagemath, Inc. and our
                  affiliates and subsidiaries. This Privacy Policy explains our
                  online and offline information practices, the kinds of
                  information we may collect, how we intend to use and share
                  that information, and how you can opt out of a use or correct
                  or change such information. All other terms not defined in
                  Section 13 or otherwise herein will have the meanings set
                  forth in the Terms.
                </p>
              </div>
              <div id="scope">
                <h1>2 Scope</h1>
                <p>
                  This Privacy Policy applies to Personal Information that is
                  Processed by Sagemath in the course of our business, including
                  on Sagemath websites (each a <strong>“Site”</strong>), mobile
                  applications, forums, blogs, and other online or offline
                  offerings (collectively the <strong>“Services”</strong>). All
                  individuals whose responsibilities include the Processing of
                  Personal Information on behalf of Sagemath are expected to
                  protect that data by adherence to this Privacy Policy.
                </p>
                <p>
                  Sagemath complies with the EU-U.S. Data Privacy Framework
                  (EU-U.S. DPF), the UK Extension to the EU-U.S. DPF, and the
                  Swiss-U.S. Data Privacy Framework (Swiss-U.S. DPF) as set
                  forth by the U.S. Department of Commerce. Sagemath has
                  certified to the U.S. Department of Commerce that it adheres
                  to the EU-U.S. Data Privacy Framework Principles (EU-U.S. DPF
                  Principles) with regard to the processing of personal data
                  received from the European Union in reliance on the EU-U.S.
                  DPF and from the United Kingdom (and Gibraltar) in reliance on
                  the UK Extension to the EU-U.S. DPF. Sagemath has certified to
                  the U.S. Department of Commerce that it adheres to the
                  Swiss-U.S. Data Privacy Framework Principles (Swiss-U.S. DPF
                  Principles) with regard to the processing of personal data
                  received from Switzerland in reliance on the Swiss-U.S. DPF.
                  If there is any conflict between the terms in this privacy
                  policy and the EU-U.S. DPF Principles and/or the Swiss-U.S.
                  DPF Principles, the Principles shall govern. To learn more
                  about the Data Privacy Framework (DPF) program, and to view
                  our certification, please visit{" "}
                  <A href="https://www.dataprivacyframework.gov/">
                    www.dataprivacyframework.gov
                  </A>
                  . Additionally, Sagemath may protect information through other
                  legally valid methods, including international data transfer
                  agreements.{" "}
                </p>{" "}
                <p>
                  {" "}
                  This Policy applies to all Sagemath’s operating divisions,
                  subsidiaries, affiliates, and branches, including its U.S.
                  affiliates certified under the DPF program and any additional
                  subsidiary, affiliate, or branch of Sagemath that we may
                  subsequently form.{" "}
                </p>{" "}
              </div>{" "}
              <div id="transparencynoticetypes-of-personal-information-we-collect-and-how-we-use-it">
                <h1>
                  3 Transparency Notice - Types of Personal Information We
                  Collect and How We Use It
                </h1>
                <p>
                  The types of Personal Information we may collect (directly
                  from you or from Third-Party sources) and our privacy
                  practices depend on the nature of the relationship you have
                  with Sagemath and the requirements of applicable law. Some of
                  the ways that Sagemath may collect Personal Information
                  include:{" "}
                </p>{" "}
                <ul>
                  {" "}
                  <li>
                    {" "}
                    <p>
                      {" "}
                      You may provide Personal Information directly to Sagemath
                      through interacting with the Services, participating in
                      surveys, and requesting Services, or information.{" "}
                    </p>{" "}
                  </li>{" "}
                  <li>
                    {" "}
                    <p>
                      {" "}
                      As you navigate the Services, certain passive information
                      may also be collected about your visit, including through
                      cookies and similar technologies as described below.{" "}
                    </p>{" "}
                  </li>{" "}
                </ul>{" "}
                <p>
                  {" "}
                  We endeavor to collect only that information which is relevant
                  for the purposes of Processing. Below are the ways we collect
                  Personal Information and how we use it.{" "}
                </p>{" "}
                <div id="types-of-personal-information-we-collect">
                  {" "}
                  <h2> 3.1 Types of Personal Information We Collect </h2>
                  <p>
                    Sagemath collects Personal Information regarding its
                    current, prospective, and former clients, customers, users,
                    visitors, guests, and Employees (collectively{" "}
                    <strong>“Individuals”</strong>).{" "}
                  </p>
                  <p>
                    <strong>Information You Provide Directly to Us.</strong>{" "}
                    When you use the Services or engage in certain activities,
                    such as registering for an account with Sagemath, responding
                    to surveys, requesting Services or information, or
                    contacting us directly, we may ask you to provide some or
                    all of the following types of information:{" "}
                  </p>
                  <ul>
                    <li>
                      <p>
                        <strong>Communications with Us.</strong> We may collect
                        Personal Information from you such as email address,
                        phone number or mailing address when you choose to
                        request information about our Services, register for
                        Sagemath’s newsletter or a loyalty program that we may
                        offer, request to receive customer or technical support,
                        or otherwise communicate with us.{" "}
                      </p>{" "}
                    </li>{" "}
                    <li>
                      {" "}
                      <p>
                        {" "}
                        <strong>Surveys.</strong> We may contact you to
                        participate in surveys. If you do decide to participate,
                        you may be asked to provide certain information which
                        may include Personal Information. All information
                        collected from your participation in our surveys is
                        provided by you voluntarily.{" "}
                      </p>{" "}
                    </li>{" "}
                    <li>
                      {" "}
                      <p>
                        {" "}
                        <strong>Posting on the Services.</strong> Sagemath may
                        offer publicly accessible forums, blogs, and social
                        media pages. You should be aware that, when you disclose
                        information about yourself in on Sagemath’s forums,
                        blogs, and social media pages, the Services will collect
                        the information you provide in such submissions,
                        including any Personal Information. If you choose to
                        submit content to any public area of the Site, such
                        content will be considered “public” and will not be
                        subject to the privacy protections set forth
                        herein.{" "}
                      </p>{" "}
                    </li>{" "}
                  </ul>{" "}
                  <p>
                    {" "}
                    <strong>Automatic Data Collection.</strong> We may collect
                    the following information automatically through our Services
                    or other methods of web analysis: your Internet protocol
                    (IP) address, cookie identifiers, details about your browser
                    or device, and information about how you use the
                    Services.{" "}
                  </p>{" "}
                  <p>
                    {" "}
                    <strong>Information from Other Sources.</strong> We may
                    receive information about you from other public sources,
                    including through Third-Party services and organizations to
                    supplement information provided by you. This supplemental
                    information allows us to verify information that you have
                    provided to Sagemath and to enhance our ability to provide
                    you with information about our business, products, and
                    Services.{" "}
                  </p>{" "}
                </div>{" "}
                <div id="how-sagemath-uses-your-information">
                  {" "}
                  <h2> 3.2 How Sagemath, Inc. Uses Your Information </h2>{" "}
                  <p>
                    {" "}
                    We Process Personal Information about Individuals for the
                    following business purposes:{" "}
                  </p>{" "}
                  <p>
                    {" "}
                    <strong>
                      To Provide Products, Services, or Information Requested:
                    </strong>{" "}
                  </p>{" "}
                  <ul>
                    {" "}
                    <li>
                      Generally manage Individual information and accounts;{" "}
                    </li>{" "}
                    <li>
                      Respond to questions, comments, and other requests;{" "}
                    </li>{" "}
                    <li>
                      Provide access to certain areas, functionalities, and
                      features of Sagemath’s Services;{" "}
                    </li>{" "}
                    <li>
                      Contact you to answer requests for customer support or
                      technical support;{" "}
                    </li>{" "}
                    <li>Allow you to register for events. </li>{" "}
                  </ul>{" "}
                  <p>
                    {" "}
                    <strong>Administrative Purposes:</strong>{" "}
                  </p>{" "}
                  <ul>
                    {" "}
                    <li>Measure interest in Sagemath’s Services; </li>{" "}
                    <li>Develop new products and Services; </li>{" "}
                    <li>Ensure internal quality control; </li>{" "}
                    <li>Verify Individual identity; </li>{" "}
                    <li>
                      Communicate about Individual accounts and activities on
                      Sagemath’s Services and systems, and, in Sagemath’s
                      discretion, changes to any Sagemath policy;{" "}
                    </li>{" "}
                    <li>
                      Send email to the email address you provide to us to
                      verify your account and for informational and operational
                      purposes, such as account management, customer service, or
                      system maintenance;{" "}
                    </li>{" "}
                    <li>
                      Process payment for products or services purchased;{" "}
                    </li>{" "}
                    <li>Process applications and transactions; </li>{" "}
                    <li>
                      Prevent potentially prohibited or illegal activities;{" "}
                    </li>{" "}
                    <li>Enforce our Terms. </li>{" "}
                  </ul>{" "}
                  <p>
                    {" "}
                    <strong>
                      Marketing Sagemath Products and Services:
                    </strong>{" "}
                  </p>{" "}
                  <ul>
                    {" "}
                    <li>To tailor content; </li>{" "}
                    <li>
                      To notify you about offers, products, and services that
                      may be of interest to you;{" "}
                    </li>{" "}
                    <li>To provide Services to you; </li>{" "}
                    <li>
                      For other purposes disclosed at the time that Individuals
                      provide Personal Information;{" "}
                    </li>{" "}
                    <li>Otherwise with your consent. </li>{" "}
                  </ul>{" "}
                  <p>
                    {" "}
                    You may contact us at any time to opt out of the use of your
                    Personal Information for marketing purposes as set forth
                    below.{" "}
                  </p>{" "}
                  <ul>
                    {" "}
                    <li>
                      {" "}
                      <p>
                        {" "}
                        <strong>Research and Development.</strong> Sagemath may
                        use Personal Information to create non-identifiable
                        information that we may use alone or in the aggregate
                        with information obtained from other sources, in order
                        to help us to optimally deliver our existing products
                        and Services or develop new products and Services. We
                        may share anonymous Individual and aggregate data for
                        research and analysis purposes.{" "}
                      </p>{" "}
                    </li>{" "}
                    <li>
                      {" "}
                      <p>
                        {" "}
                        <strong>
                          Direct Mail, Email and Outbound Telemarketing.
                        </strong>{" "}
                        Individuals who provide us with Personal Information, or
                        whose Personal Information we obtain from Third Parties,
                        may receive periodic emails, newsletters, mailings, or
                        phone calls from us with information on Sagemath’s or
                        our business partners’ products and services or upcoming
                        special offers/events. We offer the option to decline
                        these communications at no cost to the Individual by
                        following the instructions set forth below.{" "}
                      </p>{" "}
                    </li>{" "}
                    <li>
                      {" "}
                      <p>
                        {" "}
                        <strong>
                          Anonymous and Aggregated Information Use.
                        </strong>{" "}
                        Sagemath may use Personal Information and other
                        information about you to create anonymized and
                        aggregated information, such as de-identified
                        demographic information, de-identified location
                        information, information about the computer or device
                        from which you access Sagemath’s Services, or other
                        analyses we create. Anonymized or aggregated information
                        is not Personal Information, and Sagemath may use such
                        information in a number of ways, including research,
                        internal analysis, analytics, and any other legally
                        permissible purposes. We may share this information
                        within Sagemath and with Third Parties for our or their
                        purposes in an anonymized or aggregated form that is
                        designed to prevent anyone from identifying you.{" "}
                      </p>{" "}
                    </li>{" "}
                    <li>
                      {" "}
                      <p>
                        {" "}
                        <strong>Sharing Content.</strong> Sagemath’s Services
                        may offer various tools and functionalities that allow
                        you to share content. For example, Sagemath allows you
                        to provide information about your colleagues, students,
                        or friends through our course management system and
                        referral services, such as inviting a collaborator to a
                        project. Our referral services may allow you to forward
                        or share certain content with others, such as emails
                        inviting them to use our Services. Email addresses that
                        you may provide in such situations will be used to send
                        the content or link you request, but will not be
                        collected or otherwise used by Sagemath or any other
                        Third Parties for any other purpose. The Services also
                        allow you to share your content with Third Parties such
                        as GitHub and NPM. Any Personal Information you choose
                        to share with these Third Parties is not covered by this
                        Privacy Policy. We encourage you to review the privacy
                        policy of these Third Parties before submitting your
                        Personal Information.{" "}
                      </p>{" "}
                    </li>{" "}
                    <li>
                      {" "}
                      <p>
                        {" "}
                        <strong>Other Uses.</strong> Sagemath may use Personal
                        Information to pursue our legitimate interests, such as
                        direct marketing, marketing research, network and
                        information security, and fraud prevention and any other
                        purpose disclosed to you at the time you provide
                        Personal Information or otherwise with your
                        consent.{" "}
                      </p>{" "}
                    </li>{" "}
                  </ul>{" "}
                </div>{" "}
                <div id="cookies-pixel-tagsweb-beacons-analytics-information-and-interest-based-advertising">
                  {" "}
                  <h2> 3.3 Cookies and Pixel Tags (Web Beacons) </h2>{" "}
                  <p>
                    {" "}
                    We, as well as Third-Parties that provide content,
                    advertising, or other functionality on the Services, may use
                    cookies, pixel tags, local storage, and other technologies (
                    <strong>“Technologies”</strong>) to automatically collect
                    information through the Services.{" "}
                  </p>{" "}
                  <ul>
                    {" "}
                    <li>
                      {" "}
                      <p>
                        {" "}
                        <strong>Cookies.</strong> Cookies are small text files
                        placed in visitors’ computer browsers to store their
                        preferences. We use required cookies to make sure that
                        the Services work properly, for example for
                        authentication purposes. You may not opt-out of the use
                        of these cookies since it would be impossible for us to
                        provide the service otherwise. We do NOT use cookies for
                        marketing or advertising purpuses.{" "}
                      </p>{" "}
                    </li>{" "}
                    <li>
                      {" "}
                      <p>
                        {" "}
                        <strong>Pixel Tags/Web Beacons.</strong> A pixel tag
                        (also known as a web beacon) is a piece of code embedded
                        on the Services that collects information about users’
                        engagement on that web page. We do not use pixel tags
                        directly, but some of our service providers, namely
                        Salesloft and ZenDesk, may use similar technology to let
                        us know that email messages have been opened, acted on,
                        or forwarded. You can consult their privacy policies and
                        other documents following the links on our Third Parties
                        page at{" "}
                        <A href="/policies/thirdparties">
                          https://cocalc.com/policies/thirdparties
                        </A>{" "}
                      </p>{" "}
                    </li>{" "}
                  </ul>{" "}
                </div>{" "}
                <div id="third-party-websites-social-media-platforms-and-software-development-kits">
                  {" "}
                  <h2>
                    3.4 Third-Party Websites, Social Media Platforms, and
                    Software Development Kits{" "}
                  </h2>{" "}
                  <p>
                    {" "}
                    The Services may contain links to other websites and other
                    websites may reference or link to our Services. These other
                    domains and websites are not controlled by us, and Sagemath
                    does not endorse or make any representations about
                    Third-Party websites or social media platforms. We encourage
                    our users to read the privacy policies of each and every
                    website and application with which they interact. We do not
                    endorse, screen or approve, and are not responsible for the
                    privacy practices or content of such other websites or
                    applications. Visiting these other websites or applications
                    is at your own risk.{" "}
                  </p>{" "}
                  <p>
                    {" "}
                    The Services may include publicly accessible forums, blogs,
                    and social media pages You should be aware that Personal
                    Information which you voluntarily include and transmit
                    online in a publicly accessible forum, blog, or social media
                    page may be viewed and used by others without any
                    restrictions. By using such services you assume the risk
                    that the Personal Information provided by you may be viewed
                    and used by third parties for any number of purposes.{" "}
                  </p>{" "}
                  <p>
                    {" "}
                    We use Third-Party software development kits (
                    <strong>“SDKs”</strong>), such as the Stripe, Inc. SDK, as
                    part of the functionality of our Services.{" "}
                  </p>{" "}
                </div>{" "}
                <div id="third-party-payment-processing">
                  {" "}
                  <h2>3.5 Third-Party Payment Processing </h2>{" "}
                  <p>
                    {" "}
                    When you make purchases through the Services, we process
                    your payments through our Payment Processor, Stripe. The
                    Payment Processor collects information from and about you
                    that is necessary to process your payment and to prevent
                    abuse. This may include your name, email address, billing
                    address, tax identifies, IP address, and account numbers. We
                    do not get access to your full account numbers. You can
                    consult Stripe's privacy policy and other documents
                    following the links on our Third Parties page at{" "}
                    <A href="/policies/thirdparties">
                      https://cocalc.com/policies/thirdparties
                    </A>{" "}
                  </p>{" "}
                </div>{" "}
              </div>{" "}
              <div id="human-resources-data">
                <h1>4 Human Resources Data</h1>
                <p>
                  Sagemath collects Personal Information from current,
                  prospective, and former Employees, their contact points in
                  case of a medical emergency, and beneficiaries under any
                  insurance policy (<strong>“Human Resources Data”</strong>).
                  The Human Resources Data we collect may include title, name,
                  address, phone number, email address, date of birth, passport
                  number, driver’s license number, Social Security number or
                  other government-issued identification number, financial
                  information related to credit checks, bank details for
                  payroll, information that may be recorded on a CV or
                  application form, language abilities, contact information of
                  third parties in case of an emergency and beneficiaries under
                  any insurance policy.{" "}
                </p>{" "}
                <p>
                  {" "}
                  We Process Human Resources Data for a variety of business
                  purposes including:{" "}
                </p>{" "}
                <ul>
                  {" "}
                  <li>
                    Workflow management, including assigning, managing and
                    administering projects;{" "}
                  </li>{" "}
                  <li>Human Resources administration and communication; </li>{" "}
                  <li>Payroll and the provision of benefits; </li>{" "}
                  <li>
                    Compensation, including bonuses and long-term incentive
                    administration, stock plan administration, compensation
                    analysis, including monitoring overtime and compliance with
                    labor laws, and company recognition programs;{" "}
                  </li>{" "}
                  <li>Job grading activities; </li>{" "}
                  <li>Performance and employee development management; </li>{" "}
                  <li>Organizational development and succession planning; </li>{" "}
                  <li>Benefits and personnel administration; </li>{" "}
                  <li>Absence management; </li>{" "}
                  <li>Helpdesk and IT support services; </li>{" "}
                  <li>Regulatory compliance; </li>{" "}
                  <li>
                    Internal and/or external or governmental compliance
                    investigations;{" "}
                  </li>{" "}
                  <li>Internal or external audits; </li>{" "}
                  <li>Litigation evaluation, prosecution, and defense; </li>{" "}
                  <li>Restructuring and relocation; </li>{" "}
                  <li>Emergency contacts and services; </li>{" "}
                  <li>Employee safety; </li>{" "}
                  <li>Compliance with statutory requirements; </li>{" "}
                  <li>
                    Processing of Employee expenses and travel charges; and{" "}
                  </li>{" "}
                  <li>Acquisitions, divestitures, and integrations. </li>{" "}
                </ul>{" "}
              </div>{" "}
              <div id="onward-transfersagemath-may-disclose-your-information">
                <h1>
                  <span>5</span> Onward Transfer — Sagemath May Disclose Your
                  Information{" "}
                </h1>{" "}
                <div id="information-we-share">
                  {" "}
                  <h2>
                    <span>5.1</span> Information We Share
                  </h2>
                  <p>
                    {" "}
                    We may share your information as described in this Privacy
                    Policy (e.g., with our Third-Party service providers; to
                    comply with legal obligations; to protect and defend our
                    rights and property) or with your permission.{" "}
                  </p>{" "}
                  <ul>
                    {" "}
                    <li>
                      {" "}
                      <p>
                        {" "}
                        <strong>
                          We Use Vendors and Service Providers.
                        </strong>{" "}
                        We may share any information we receive with vendors and
                        service providers. The types of service providers
                        (processors) to whom we entrust Personal Information
                        include service providers for: (i) provision of IT,
                        marketing, and related services; (ii) provision of
                        information and services you have requested; (iii)
                        payment processing; (iv) customer service activities;
                        and (v) in connection with the provision of the
                        Services.{" "}
                      </p>{" "}
                    </li>{" "}
                    <li>
                      {" "}
                      <p>
                        {" "}
                        <strong>Business Partners.</strong> Sagemath may share
                        your Personal Information with our business partners and
                        affiliates to provide you with a product or service that
                        you have requested. Sagemath may also provide Personal
                        Information to business partners with whom we may
                        jointly offer products or services, or whose products or
                        services we believe may be of interest to you. In such
                        cases, our business partner’s name will appear, along
                        with Sagemath. Sagemath requires our affiliates and
                        business partners to agree in writing to maintain the
                        confidentiality and security of Personal Information
                        they maintain on our behalf and not to use it for any
                        purpose other than the purpose for which Sagemath
                        provided them.{" "}
                      </p>{" "}
                    </li>{" "}
                    <li>
                      {" "}
                      <p>
                        {" "}
                        <strong>DPF.</strong> With respect to onward transfers
                        to Agents under DPF, DPF requires that Sagemath remain
                        liable should its Agents Process Personal Information in
                        a manner inconsistent with the DPF Principles.{" "}
                      </p>{" "}
                    </li>{" "}
                    <li>
                      {" "}
                      <p>
                        {" "}
                        <strong>Displaying to Other Users.</strong> The content
                        you post to the Services may be displayed on the
                        Services. Other users of the Services may be able to see
                        some information about you, such as your name. We are
                        not responsible for privacy practices of the other users
                        who will view and use the posted information.{" "}
                      </p>{" "}
                    </li>{" "}
                    <li>
                      {" "}
                      <p>
                        {" "}
                        <strong>
                          Disclosures to Protect Us or Others (e.g., as Required
                          by Law and Similar Disclosures).
                        </strong>{" "}
                        We may access, preserve, and disclose your Personal
                        Information, other account information, and content if
                        we believe doing so is required or appropriate to: (i)
                        comply with law enforcement or national security
                        requests and legal process, such as a court order or
                        subpoena; (ii) respond to your requests; (iii) protect
                        yours’, ours’ or others’ rights, property, or safety;
                        (iv) to enforce Sagemath policies or contracts; (v) to
                        collect amounts owed to Sagemath; (vi) when we believe
                        disclosure is necessary or appropriate to prevent
                        physical harm or financial loss or in connection with an
                        investigation or prosecution of suspected or actual
                        illegal activity; or (vii) if we, in good faith, believe
                        that disclosure is otherwise necessary or
                        advisable.{" "}
                      </p>{" "}
                    </li>{" "}
                    <li>
                      {" "}
                      <p>
                        {" "}
                        <strong>
                          Merger, Sale, or Other Asset Transfers.
                        </strong>{" "}
                        If we are involved in a merger, acquisition, financing
                        due diligence, reorganization, bankruptcy, receivership,
                        sale of company assets, or transition of service to
                        another provider, then your information may be sold or
                        transferred as part of such a transaction as permitted
                        by law and/or contract.{" "}
                      </p>{" "}
                    </li>{" "}
                  </ul>{" "}
                </div>{" "}
                <div id="international-data-transfers">
                  {" "}
                  <h2>
                    {" "}
                    <span>5.2</span> International Data Transfers{" "}
                  </h2>{" "}
                  <p>
                    {" "}
                    You agree that all information collected via or by Sagemath
                    may be transferred, processed, and stored in the United
                    States, in the cloud, on our servers, on the servers of our
                    affiliates, or the servers of our service providers, in
                    order to provide the Services.{" "}
                  </p>{" "}
                  <p>
                    If you use Services that require you to select a geographic
                    location explicitly, such as compute servers or cloud file
                    systems, your data will be sent to the chosen location.
                  </p>
                </div>{" "}
              </div>{" "}
              <div id="opt-out-right-to-object-to-processing">
                {" "}
                <h1>
                  {" "}
                  <span>6</span> Opt-Out (Right to Object to Processing){" "}
                </h1>{" "}
                <div id="general">
                  {" "}
                  <h2>
                    {" "}
                    <span>6.1</span> General{" "}
                  </h2>{" "}
                  <p>
                    {" "}
                    You have the right to object to and opt out of certain uses
                    of your Personal Information. Where you have consented to
                    Sagemath’s Processing of your Personal Information or
                    Sensitive Personal Information, you may withdraw that
                    consent at any time and opt out of further Processing by
                    contacting{" "}
                    <A href="mailto:office@sagemath.com">office@sagemath.com</A>
                    . Even if you opt out, we may still collect and use
                    non-Personal Information regarding your activities on our
                    Services and/or information from the advertisements on
                    Third-Party websites for non-interest based advertising
                    purposes, such as to determine the effectiveness of the
                    advertisements.{" "}
                  </p>{" "}
                </div>{" "}
                <div id="email-and-telephone-communications">
                  {" "}
                  <h2>
                    {" "}
                    <span>6.2</span> Email and Telephone Communications{" "}
                  </h2>{" "}
                  <p>
                    {" "}
                    If you receive an unwanted email from us, you can use the
                    unsubscribe link found at the bottom of the email to opt out
                    of receiving future emails. We will process your request
                    within a reasonable time after receipt. Note that you will
                    continue to receive transaction-related emails regarding
                    products or services you have requested. We may also send
                    you certain non-promotional communications regarding
                    Sagemath and our Services and you will not be able to opt
                    out of those communications (e.g., communications regarding
                    updates to our Terms or this Privacy Policy).{" "}
                  </p>{" "}
                  <p>
                    {" "}
                    We maintain telephone “do-not-call” and “do-not-mail” lists
                    as mandated by law. We process requests to be placed on
                    do-not-mail, do-not-phone and do-not-contact lists within 60
                    days after receipt, or such shorter time as may be required
                    by law.{" "}
                  </p>{" "}
                </div>{" "}
                <div id="mobile-devices">
                  {" "}
                  <h2>
                    {" "}
                    <span>6.3</span> Mobile devices{" "}
                  </h2>{" "}
                  <p>
                    {" "}
                    Sagemath may occasionally send you push notifications
                    through our mobile applications with notices that may be of
                    interest to you. You may at any time opt out from receiving
                    these types of communications by changing the settings on
                    your mobile device. Sagemath may also collect location-based
                    information if you use our mobile applications. You may opt
                    out of this collection by changing the settings on your
                    mobile device.{" "}
                  </p>{" "}
                </div>{" "}
                <div id="human-resources-data-1">
                  {" "}
                  <h2>
                    {" "}
                    <span>6.4</span> Human Resources Data{" "}
                  </h2>{" "}
                  <p>
                    {" "}
                    With regard to Personal Information that Sagemath receives
                    in connection with the employment relationship, Sagemath
                    will use such Personal Information only for
                    employment-related purposes as more fully described above.
                    If Sagemath intends to use this Personal Information for any
                    other purpose, Sagemath will contact the Individual and
                    proceed only after obtaining affirmative express consent
                    (opt in).{" "}
                  </p>{" "}
                </div>{" "}
                <div id="do-not-track">
                  {" "}
                  <h2>
                    {" "}
                    <span>6.5</span> “Do Not Track”{" "}
                  </h2>{" "}
                  <p>
                    {" "}
                    Do Not Track (<strong>“DNT”</strong>) is a privacy
                    preference that users can set in certain web browsers. DNT
                    is a way for users to inform websites and services that they
                    do not want certain information about their webpage visits
                    collected over time and across websites or online services.
                    Please note that we do not respond to or honor DNT signals
                    or similar mechanisms transmitted by web browsers.{" "}
                  </p>{" "}
                </div>{" "}
              </div>{" "}
              <div id="rights-of-access-rectification-erasure-and-restriction">
                {" "}
                <h1>
                  {" "}
                  <span>7</span> Rights of Access, Rectification, Erasure,
                  Restriction, and to Object{" "}
                </h1>{" "}
                <p>
                  {" "}
                  In accordance with applicable law, you may have the right to:
                  (i) request confirmation of whether we are processing your
                  personal information; (ii) obtain access to or a copy of your
                  personal information; (iii) receive an electronic copy of
                  personal information that you have provided to us, or ask us
                  to send that information to another company (the “right of
                  data portability”); (iv) restrict our uses of your personal
                  information; (v) seek correction of inaccurate, untrue or
                  incomplete personal information; (vi) request erasure of
                  personal information held about you by Sagemath, subject to
                  certain exceptions prescribed by law; (vii) object to
                  processing of your personal information. If you would like to
                  exercise any of these rights, please contact us as set forth
                  below.{" "}
                </p>{" "}
                <p>
                  {" "}
                  We will process such requests in accordance with applicable
                  laws and free of charge. However, if the request is excessive
                  or repetitive, Sagemath may charge a reasonable fee. To
                  protect your privacy, Sagemath will take steps to verify your
                  identity before fulfilling your request.{" "}
                </p>{" "}
              </div>{" "}
              <div id="data-retention">
                {" "}
                <h1>
                  {" "}
                  <span>8</span> Data Retention{" "}
                </h1>{" "}
                <p>
                  {" "}
                  Sagemath retains the Personal Information we receive as
                  described in this Privacy Policy for as long as you use our
                  Services or as necessary to fulfill the purpose(s) for which
                  it was collected, provide our Services, resolve disputes,
                  establish legal defenses, conduct audits, pursue legitimate
                  business purposes, enforce our agreements, and comply with
                  applicable laws.{" "}
                </p>{" "}
              </div>{" "}
              <div id="security-of-your-information">
                {" "}
                <h1>
                  {" "}
                  <span>9</span> Security of Your Information{" "}
                </h1>{" "}
                <p>
                  {" "}
                  We take steps to ensure that your information is treated
                  securely and in accordance with this Privacy Policy. We
                  encrypt data storage and backups, use firewalls and access
                  control. You can learn more details about measures taken and
                  third party audits and certifications on our Trust page at{" "}
                  <A href="/policies/trust">
                    https://cocalc.com/policies/trust
                  </A>{" "}
                  Unfortunately, the Internet cannot be guaranteed to be 100%
                  secure, and we cannot ensure or warrant the security of any
                  information you provide to us. To the fullest extent permitted
                  by applicable law, we do not accept liability for
                  unintentional disclosure.{" "}
                </p>{" "}
                <p>
                  {" "}
                  By using the Services or providing Personal Information to us,
                  you agree that we may communicate with you electronically
                  regarding security, privacy, and administrative issues
                  relating to your use of the Services. If we learn of a
                  personal data breach, in accordance with GDPR we will inform
                  the Supervisory Authority within 72 hours. If there is a high
                  risk to your security or if required by the Supervisory
                  Authority, we will notify you electronically by posting a
                  notice on the Services or sending an e-mail to you.
                </p>{" "}
              </div>{" "}
              <div id="childrens-privacy">
                {" "}
                <h1>
                  {" "}
                  <span>10</span> Children’s Privacy{" "}
                </h1>{" "}
                <p>
                  {" "}
                  The Services are not directed to children under 16 years of
                  age, and Sagemath does not knowingly collect Personal
                  Information from children under 16 years of age. If we learn
                  that we have collected any Personal Information from children
                  under 16 years old, we will promptly take steps to delete such
                  information.{" "}
                </p>{" "}
              </div>{" "}
              <div id="redresscompliance-and-accountability">
                {" "}
                <h1>
                  {" "}
                  <span>11</span> Redress/Compliance and Accountability{" "}
                </h1>{" "}
                <p>
                  {" "}
                  If you have any questions about our privacy practices or this
                  Privacy Policy, please contact Sagemath by email at{" "}
                  <A href="mailto:office@sagemath.com">office@sagemath.com</A>.
                  We will address your concerns and attempt to resolve any
                  privacy issues in a timely manner.{" "}
                </p>{" "}
                <p>
                  {" "}
                  If you are a EU resident, you may contact our Ireland
                  Representative: Instant EU GDPR Representative Ltd, Adam
                  Brogden,{" "}
                  <a href="mailto:contact@gdprlocal.com">
                    contact@gdprlocal.com
                  </a>
                  , Tel +353 15 549 700,{" "}
                  <a href="https://sagemathinc.gdprlocal.com/eu">
                    https://sagemathinc.gdprlocal.com/eu
                  </a>
                  , INSTANT EU GDPR REPRESENTATIVE LIMITED Office 2 12A Lower
                  Main Street, Lucan Co. Dublin K78 X5P8 Ireland{" "}
                </p>{" "}
                <p>
                  {" "}
                  If you are a UK resident, you may contact our UK
                  Representative: GDPRLocal Ltd, Adam Brogden,{" "}
                  <a href="mailto:contact@gdprlocal.com">
                    contact@gdprlocal.com
                  </a>
                  , Tel +441 772 217 800,{" "}
                  <a href="https://sagemathinc.gdprlocal.com/uk">
                    https://sagemathinc.gdprlocal.com/uk
                  </a>
                  , GDPRLocal Ltd. 1st Floor Front Suite 27-29 North Street,
                  Brighton England BN1 1EB{" "}
                </p>{" "}
                <p>
                  {" "}
                  In compliance with the EU-U.S. DPF, the UK Extension to the
                  EU-U.S. DPF, and the Swiss-U.S. DPF, Sagemath commits to
                  resolve DPF Principles-related complaints about our collection
                  and use of your personal information. EU, UK, and Swiss
                  individuals with inquiries or complaints regarding our
                  handling of personal data received in reliance on the EU-U.S.
                  DPF, the UK Extension to the EU-U.S. DPF, and the Swiss-U.S.
                  DPF should first contact Sagemath at the contact information
                  provided above.{" "}
                </p>{" "}
                <p>
                  {" "}
                  In compliance with the EU-U.S. DPF, the UK Extension to the
                  EU-U.S. DPF, and the Swiss-U.S. DPF, Sagemath commits to
                  cooperate and comply respectively with the advice of the panel
                  established by the EU data protection authorities (DPAs), the
                  UK Information Commissioner’s Office (ICO) and the Gibraltar
                  Regulatory Authority (GRA), and the Swiss Federal Data
                  Protection and Information Commissioner (FDPIC) with regard to
                  unresolved complaints concerning our handling of personal data
                  received in reliance on the EU-U.S. DPF, the UK Extension to
                  the EU-U.S. DPF, and the Swiss-U.S. DPF.{" "}
                </p>{" "}
                <p>
                  {" "}
                  Such independent dispute resolution mechanisms are available
                  to citizens free of charge. If any request remains unresolved,
                  you may contact the national data protection authority for
                  your EU Member State.{" "}
                </p>{" "}
                <p>
                  {" "}
                  You may also have a right, under certain conditions, to invoke
                  binding arbitration for complaints regarding DPF compliance
                  not resolved by any of the other DPF mechanisms; for
                  additional information, see{" "}
                  <A href="https://www.dataprivacyframework.gov/s/article/ANNEX-I-introduction-dpf?tabset-35584=2">
                    www.dataprivacyframework.gov/s/article/ANNEX-I-introduction-dpf?tabset-35584=2
                  </A>
                  . The Federal Trade Commission has jurisdiction over
                  Sagemath’s compliance with the EU-U.S. DPF, the UK Extension
                  to the EU-U.S. DPF, and the Swiss-U.S. DPF.{" "}
                </p>{" "}
              </div>{" "}
              <div id="other-rights-and-important-information">
                {" "}
                <h1>
                  {" "}
                  <span>12</span> Other Rights and Important Information{" "}
                </h1>{" "}
                <div id="changes-to-our-privacy-policy-and-practices">
                  {" "}
                  <h2>
                    {" "}
                    <span>12.1</span> Changes To Our Privacy Policy and
                    Practices{" "}
                  </h2>{" "}
                  <p>
                    {" "}
                    We may revise this Privacy Policy from time to time in our
                    sole discretion. If there are any material changes to this
                    Privacy Policy, we will notify you as required by applicable
                    law. You understand and agree that you will be deemed to
                    have accepted the updated Privacy Policy if you continue to
                    use the Services after the new Privacy Policy takes
                    effect.{" "}
                  </p>{" "}
                </div>{" "}
                <div id="california-privacy-rights">
                  {" "}
                  <h2>
                    {" "}
                    <span>12.2</span> California Privacy Rights{" "}
                  </h2>{" "}
                  <p>
                    {" "}
                    California law permits users who are California residents to
                    request and obtain from us once a year, free of charge, a
                    list of the Third Parties to whom we have disclosed their
                    Personal Information (if any) for their direct marketing
                    purposes in the prior calendar year, as well as the type of
                    Personal Information disclosed to those parties. Sagemath
                    does not share Personal Information with Third Parties for
                    their own marketing purposes.{" "}
                  </p>{" "}
                </div>{" "}
                <div id="supervisory-authority">
                  {" "}
                  <h2>
                    {" "}
                    <span>12.3</span> Supervisory Authority{" "}
                  </h2>{" "}
                  <p>
                    {" "}
                    If you are located in the European Economic Area, you have
                    the right to lodge a complaint with a supervisory authority
                    if you believe our processing of your Personal Information
                    violates applicable law.{" "}
                  </p>{" "}
                </div>{" "}
                <div id="compliance">
                  {" "}
                  <h2>
                    {" "}
                    <span>12.4</span> Compliance{" "}
                  </h2>{" "}
                  <p>
                    {" "}
                    This Policy shall be implemented by Sagemath and all its
                    operating divisions, subsidiaries and affiliates. Sagemath
                    has put in place mechanisms to verify ongoing compliance
                    with DPF Principles and this Policy. Any Employee that
                    violates these privacy principles will be subject to
                    disciplinary procedures.{" "}
                  </p>{" "}
                </div>{" "}
              </div>{" "}
              <div id="definitions">
                {" "}
                <h1>
                  {" "}
                  <span>13</span> Definitions{" "}
                </h1>{" "}
                <p>
                  {" "}
                  The following capitalized terms shall have the meanings herein
                  as set forth below.{" "}
                </p>{" "}
                <ul>
                  {" "}
                  <li>
                    {" "}
                    <p>
                      {" "}
                      <strong>“Agent”</strong> means any Third Party that
                      Processes Personal Information pursuant to the
                      instructions of, and solely for, Sagemath or to which
                      Sagemath discloses Personal Information for use on its
                      behalf.{" "}
                    </p>{" "}
                  </li>{" "}
                  <li>
                    {" "}
                    <p>
                      {" "}
                      <strong>“Employee”</strong> refers to any current,
                      temporary, permanent, prospective or former employee,
                      director, contractor, worker, or retiree of Sagemath or
                      its subsidiaries worldwide.{" "}
                    </p>{" "}
                  </li>{" "}
                  <li>
                    {" "}
                    <p>
                      {" "}
                      <strong>“Personal Information”</strong> is any information
                      relating to an identified or identifiable natural person (
                      <strong>“Individual”</strong>).{" "}
                    </p>{" "}
                  </li>{" "}
                  <li>
                    {" "}
                    <p>
                      {" "}
                      <strong>“DPF Principles”</strong> means the seven (7)
                      principles of the Data Privacy Framework: (1) notice, (2)
                      choice, (3) accountability for onward transfer, (4)
                      security, (5) data integrity and purpose limitation, (6)
                      access, and (7) recourse, enforcement, and liability.
                      Additionally, it includes the sixteen (16) supplemental
                      principles described in the Data Privacy Framework: (1)
                      sensitive data, (2) journalistic exceptions, (3) secondary
                      liability, (4) performing due diligence and conducting
                      audits, (5) the role of the data protection authorities,
                      (6) self-certification, (7) verification, (8) access, (9)
                      human resources data, (10) obligatory contracts for onward
                      transfers, (11) dispute resolution and enforcement, (12)
                      choice – timing of opt-out, (13) travel information, (14)
                      pharmaceutical and medical products, (15) public record
                      and publicly available information, and (16) access
                      requests by public authorities.{" "}
                    </p>{" "}
                  </li>{" "}
                  <li>
                    {" "}
                    <p>
                      {" "}
                      <strong>“Process”</strong> or{" "}
                      <strong>“Processing”</strong> means any operation which is
                      performed upon Personal Information, whether or not by
                      automatic means, such as collection, recording,
                      organization, structuring, storage, adaptation or
                      alteration, retrieval, consultation, use, disclosure by
                      transmission, dissemination or otherwise making available,
                      alignment or combination, restriction, erasure, or
                      destruction.{" "}
                    </p>{" "}
                  </li>{" "}
                  <li>
                    {" "}
                    <p>
                      {" "}
                      <strong>“Sensitive Data”</strong> or{" "}
                      <strong>“Sensitive Personal Information”</strong> is a
                      subset of Personal Information which, due to its nature,
                      has been classified by law or by policy as deserving
                      additional privacy and security protections. Sensitive
                      Personal Information includes Personal Information
                      regarding EU residents that is classified as a{" "}
                      <strong>“Special Category of Personal Data”</strong> under
                      EU law, which consists of the following data elements: (1)
                      race or ethnic origin; (2) political opinions; (3)
                      religious or philosophical beliefs; (4) trade union
                      membership; (5) genetic data; (6) biometric data where
                      Processed to uniquely identify a person; (6) health
                      information; (7) sexual orientation or information about
                      the Individual’s sex life; or (8) information relating to
                      the commission of a criminal offense.{" "}
                    </p>{" "}
                  </li>{" "}
                  <li>
                    {" "}
                    <p>
                      {" "}
                      <strong>“Third Party”</strong> is any company, natural or
                      legal person, public authority, agency, or body other than
                      the Individual, Sagemath or Sagemath’s Agents.
                    </p>
                  </li>
                </ul>
              </div>
              <div id="revision-history">
                <h1>
                  <span>14</span> Revision history
                </h1>
                {/* @ts-ignore */}
                <table
                  cellPadding="5px"
                  style={{ margin: "auto", border: "1px solid black" }}
                >
                  <thead>
                    <tr>
                      <th align="left"> Title </th> <th> Effective Date </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td> Sagemath Privacy Policy </td>
                      <td> 2015-05-03 </td>
                    </tr>
                    <tr>
                      <td> Updated Sagemath Privacy Policy </td>
                      <td> 2018-10-05 </td>
                    </tr>
                    <tr>
                      <td> Updated Sagemath Privacy Policy </td>
                      <td> 2018-10-29 </td>
                    </tr>
                    <tr>
                      <td>Update: Privacy Shield</td>
                      <td> 2020-02-04 </td>
                    </tr>
                    <tr>
                      <td>
                        Update: temporarily remove mention of Privacy Shield
                      </td>
                      <td> 2020-02-06 </td>
                    </tr>
                    <tr>
                      <td>Update: restore mention of Privacy Shield</td>
                      <td> 2020-02-20 </td>
                    </tr>
                    <tr>
                      <td>Update: revise JAMS link</td>
                      <td> 2022-09-15 </td>
                    </tr>
                    <tr>
                      <td>
                        Update: Data Privacy Framework instead of Privacy Shield
                      </td>
                      <td> 2023-08-23 </td>
                    </tr>
                    <tr>
                      <td>Update: clarify alignment with GDPR</td>
                      <td> 2025-02-20 </td>
                    </tr>
                    <tr>
                      <td>Update: HR data require explicit opt-in for any new use</td>
                      <td> 2025-10-03 </td>
                    </tr>
                  </tbody>
                </table>
                <p>
                  {" "}
                  A revision control history for this web page can be found at
                  <A href="https://github.com/sagemathinc/cocalc/commits/master/src/packages/next/pages/policies/privacy.tsx">
                    {" "}
                    github.com/sagemathinc/cocalc/commits/master/src/packages/next/pages/policies/privacy.tsx
                  </A>
                  .{" "}
                </p>{" "}
              </div>
              <h1>Questions?</h1>
              <p>
                Please contact us at{" "}
                <A href="mailto:office@sagemath.com">office@sagemath.com</A> if
                you have any questions about our Privacy Policy.
              </p>
            </div>
          </div>
          <Footer />
        </Layout.Content>{" "}
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}
