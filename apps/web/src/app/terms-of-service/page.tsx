import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalDocument } from '@/components/public-chrome';
import { LEGAL } from '@/lib/legal';
import { TRIAL_DAYS } from '@/lib/billing-plans';

export const metadata: Metadata = {
  title: 'Terms of Service — tmPro',
  description: 'The terms that apply to organisations using tmPro.',
};

const mail = (addr: string) => <a href={`mailto:${addr}`}>{addr}</a>;

export default function TermsOfServicePage() {
  const sections = [
    {
      id: 'agreement',
      heading: 'The agreement',
      body: (
        <>
          <p>
            These Terms of Service (&ldquo;Terms&rdquo;) are an agreement between <strong>{LEGAL.company}</strong>,
            trading as <strong>{LEGAL.tradingName}</strong> (&ldquo;we&rdquo;, &ldquo;us&rdquo;), and the organisation that subscribes to {LEGAL.product} (&ldquo;you&rdquo;,
            the &ldquo;Customer&rdquo;). The person who signs up confirms that they are authorised to accept these Terms on
            the organisation&apos;s behalf.
          </p>
          <p>
            By creating a workspace, starting a trial or using {LEGAL.product}, you accept these Terms and our{' '}
            <Link href="/privacy-policy">Privacy Policy</Link>. If you have a separately signed agreement with us (for
            example an enterprise agreement for more than 200 employees), that agreement takes priority where it differs.
          </p>
        </>
      ),
    },
    {
      id: 'service',
      heading: 'The service',
      body: (
        <>
          <p>
            {LEGAL.product} is an online platform for HR and talent management. The modules available to you depend on your
            plan (Core, Growth or Pro), as described on our <Link href="/pricing">pricing page</Link>.
          </p>
          <p>
            We may improve, change or add features over time. We will not remove a core feature of your plan during a paid
            period without giving you reasonable notice.
          </p>
        </>
      ),
    },
    {
      id: 'accounts',
      heading: 'Accounts and users',
      body: (
        <ul>
          <li>You are responsible for the users you give access to, the roles you assign them, and everything done under their logins.</li>
          <li>Users must keep their passwords confidential. Tell us straight away at {mail(LEGAL.supportEmail)} if you suspect unauthorised access.</li>
          <li>The information you give us when you sign up must be accurate, and you must keep your billing contact details up to date.</li>
          <li>You must be a business or organisation. {LEGAL.product} is not offered to individuals for personal use.</li>
        </ul>
      ),
    },
    {
      id: 'trial',
      heading: 'Free trial',
      body: (
        <ul>
          <li>New self-serve subscriptions start with a {TRIAL_DAYS}-day free trial. A valid credit or debit card is required to start it.</li>
          <li>
            Unless you cancel before the trial ends, your subscription begins automatically at the end of the trial and your
            card is charged the monthly price for your plan and company size.
          </li>
          <li>One free trial is available per organisation.</li>
        </ul>
      ),
    },
    {
      id: 'fees',
      heading: 'Plans, fees and payment',
      body: (
        <>
          <ul>
            <li>
              <strong>Pricing.</strong> Fees are a flat monthly price set by your plan and company-size band (0–20, 21–50,
              51–100 or 101–200 employees), as shown on the pricing page when you subscribe. They are not charged per user.
            </li>
            <li>
              <strong>Currency.</strong> Prices are set and charged in United States dollars (USD). Any local-currency
              amounts on our website are estimates only. Your bank may apply its own currency conversion or foreign
              transaction fees.
            </li>
            <li>
              <strong>Billing.</strong> Subscriptions are billed monthly in advance, by automatic charge to the card on file,
              through our payment processor Stripe. Invoices are available under Settings → Billing → Manage payment &amp;
              invoices.
            </li>
            <li>
              <strong>Taxes.</strong> Prices do not include taxes unless stated. You are responsible for any taxes, duties
              or withholding that apply in your country. If you are required to withhold tax, you must pay us an additional
              amount so that we receive the full fee.
            </li>
            <li>
              <strong>Company size.</strong> Your band must cover the number of employees in your workspace (all employees
              except those marked as former staff). When you reach the limit of your band you will need to move to a larger
              band before adding more employees.
            </li>
            <li>
              <strong>Price changes.</strong> We may change our prices by giving at least 30 days&apos; notice by email. The
              new price applies from your next billing period after the notice ends.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: 'changes',
      heading: 'Upgrades, downgrades and cancellation',
      body: (
        <ul>
          <li>
            <strong>Upgrades</strong> (a higher plan or a larger band) take effect immediately. The prorated difference for
            the rest of the current month is charged to your card straight away.
          </li>
          <li>
            <strong>Downgrades</strong> take effect immediately in the application, and the lower price applies from your
            next monthly invoice. Features not included in the lower plan become unavailable; the data you entered in them is
            kept and becomes available again if you upgrade.
          </li>
          <li>
            <strong>Cancellation.</strong> You can cancel at any time under Settings → Billing → Manage payment &amp;
            invoices. Cancellation stops renewal: you keep access until the end of the month you have paid for, and you are
            not charged again.
          </li>
          <li>
            <strong>Refunds.</strong> Fees already paid are not refundable, including for partial months, except where the
            law requires or we agree otherwise in writing.
          </li>
        </ul>
      ),
    },
    {
      id: 'late',
      heading: 'Failed payments and suspension',
      body: (
        <>
          <p>
            If a payment fails, we will let you know and our payment processor will retry the card over the following days.
            Your workspace stays available during this time, with a notice asking an Admin to update the card.
          </p>
          <p>
            If payment still has not been made after the retries, your subscription will be cancelled or suspended and your
            users will not be able to sign in until the outstanding amount is paid. Your data is kept as described in section
            11.
          </p>
          <p>
            We may also suspend access immediately if we reasonably believe your account is being used in breach of section 8,
            or to protect the security of the service or other customers.
          </p>
        </>
      ),
    },
    {
      id: 'use',
      heading: 'Acceptable use',
      body: (
        <>
          <p>You must not, and must not let anyone else:</p>
          <ul>
            <li>use {LEGAL.product} for anything unlawful, including recording personal information you have no lawful basis to hold;</li>
            <li>try to access another customer&apos;s data, or test, probe or bypass our security without our written permission;</li>
            <li>upload malware, or content that is defamatory, discriminatory or infringes anyone&apos;s rights;</li>
            <li>overload, disrupt or reverse-engineer the service, or scrape it by automated means; or</li>
            <li>resell or sublicense access to {LEGAL.product} without our written agreement.</li>
          </ul>
        </>
      ),
    },
    {
      id: 'data',
      heading: 'Your data',
      body: (
        <>
          <ul>
            <li>
              <strong>You own your data.</strong> All information you or your users put into {LEGAL.product}
              (&ldquo;Customer Data&rdquo;) remains yours. You give us permission to host, process and display it only as
              needed to provide and support the service.
            </li>
            <li>
              <strong>Your responsibilities.</strong> You are responsible for the accuracy of Customer Data, for having a
              lawful basis to collect it, and for giving the people it concerns any notices your local privacy law requires.
            </li>
            <li>
              <strong>Our responsibilities.</strong> We handle Customer Data in accordance with our{' '}
              <Link href="/privacy-policy">Privacy Policy</Link>, keep it confidential, protect it with the security measures
              described there, and do not use it for any other purpose.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: 'payroll',
      heading: 'Payroll, tax and compliance',
      body: (
        <>
          <p>
            {LEGAL.product} calculates pay, leave and statutory deductions using the rules configured for each country and
            the information you enter. It is a tool to help you, not professional payroll, tax or legal advice.
          </p>
          <ul>
            <li>You are responsible for checking payroll results, payslips and statutory returns before paying employees or filing returns.</li>
            <li>You are responsible for meeting your employment, tax and statutory obligations and deadlines in each country where you operate.</li>
            <li>
              Tax rates and statutory rules change. We work to keep the built-in country rules current, and we welcome reports
              of changes at {mail(LEGAL.supportEmail)}, but you must confirm the rules that apply to you.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: 'end',
      heading: 'When the subscription ends',
      body: (
        <p>
          You can download a full copy of your Customer Data at any time while your subscription is active, from Settings
          → Organization → Export all data. After your subscription ends, we keep your Customer Data for{' '}
          {LEGAL.retentionDaysAfterCancel} days so you can reactivate or ask us for a copy, and then we delete it. To
          request a copy after cancelling, email {mail(LEGAL.supportEmail)} before that period ends.
        </p>
      ),
    },
    {
      id: 'availability',
      heading: 'Availability and support',
      body: (
        <>
          <p>
            We aim to keep {LEGAL.product} available around the clock, but we do not guarantee it will be uninterrupted or
            error-free. We may need planned maintenance, which we try to schedule outside business hours for most of our
            customers.
          </p>
          <p>
            Support is provided by email at {mail(LEGAL.supportEmail)}. We aim to respond {LEGAL.supportResponse}. Help articles
            are available in our <Link href="/support">Support centre</Link>.
          </p>
        </>
      ),
    },
    {
      id: 'ip',
      heading: 'Intellectual property',
      body: (
        <p>
          We own {LEGAL.product}, including its software, design and content, and all related intellectual property. These
          Terms give you a right to use the service during your subscription; they do not transfer any ownership to you. If
          you send us suggestions or feedback, we may use them without obligation to you.
        </p>
      ),
    },
    {
      id: 'warranties',
      heading: 'Warranties',
      body: (
        <>
          <p>
            We will provide the service with reasonable care and skill. Apart from that, and to the extent the law allows, the
            service is provided &ldquo;as is&rdquo; and we give no other warranties, including warranties of fitness for a
            particular purpose.
          </p>
          <p>
            You are acquiring {LEGAL.product} for the purposes of a business. To the extent permitted by law, the Consumer
            Guarantees Act 1993 and sections 9, 12A, 13 and 14(1) of the Fair Trading Act 1986 do not apply. Nothing in these
            Terms limits any rights you have under laws that cannot be excluded.
          </p>
        </>
      ),
    },
    {
      id: 'liability',
      heading: 'Limitation of liability',
      body: (
        <>
          <ul>
            <li>
              Neither party is liable to the other for any loss of profits, revenue, business or goodwill, or for any
              indirect or consequential loss.
            </li>
            <li>
              Our total liability to you for all claims arising out of or in connection with these Terms in any 12-month
              period is limited to the fees you paid us in the 12 months before the event giving rise to the claim.
            </li>
            <li>These limits do not apply to liability that cannot be limited by law, or to loss caused by fraud or wilful misconduct.</li>
          </ul>
        </>
      ),
    },
    {
      id: 'indemnity',
      heading: 'Your indemnity',
      body: (
        <p>
          You will cover us for any third-party claim, and reasonable costs, arising from Customer Data you had no right to
          collect or upload, or from your breach of section 8.
        </p>
      ),
    },
    {
      id: 'termination',
      heading: 'Termination',
      body: (
        <p>
          You can end the agreement at any time by cancelling your subscription. We can end it by giving 30 days&apos; notice,
          or immediately if you materially breach these Terms and do not fix the breach within 14 days of our notice, or if you
          become insolvent. If we end the agreement for convenience, we will refund any fees paid for the period after it
          ends.
        </p>
      ),
    },
    {
      id: 'general',
      heading: 'General',
      body: (
        <ul>
          <li>
            <strong>Changes to these Terms.</strong> We may update these Terms. We will post the new version here and email
            customer administrators about material changes at least 30 days before they apply. Continuing to use {LEGAL.product}{' '}
            after that means you accept them.
          </li>
          <li>
            <strong>Events outside our control.</strong> Neither party is responsible for delays caused by events beyond
            its reasonable control, such as outages of internet or hosting providers, natural disasters or government action.
          </li>
          <li><strong>Notices.</strong> We will send notices to your billing email address. You can send notices to {mail(LEGAL.supportEmail)}.</li>
          <li><strong>Assignment.</strong> You may not transfer this agreement without our consent. We may transfer it as part of a sale or restructure of our business.</li>
          <li><strong>Whole agreement.</strong> These Terms, the Privacy Policy and your plan details are the whole agreement between us about {LEGAL.product}.</li>
          <li>
            <strong>Governing law.</strong> These Terms are governed by the laws of {LEGAL.country}, and the courts of{' '}
            {LEGAL.country} have non-exclusive jurisdiction.
          </li>
        </ul>
      ),
    },
    {
      id: 'contact',
      heading: 'Contact',
      body: <p>Questions about these Terms: {mail(LEGAL.supportEmail)}.</p>,
    },
  ];

  return (
    <LegalDocument
      title="Terms of Service"
      intro={
        <p>
          Please read these Terms carefully. They explain the rules for using {LEGAL.product}, how billing works, and each
          party&apos;s responsibilities.
        </p>
      }
      sections={sections}
    />
  );
}
