import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalDocument } from '@/components/public-chrome';
import { LEGAL } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Privacy Policy — tmPro',
  description: 'What information tmPro collects, how it is used, who it is shared with and how it is protected.',
};

const mail = (addr: string) => <a href={`mailto:${addr}`}>{addr}</a>;

export default function PrivacyPolicyPage() {
  const sections = [
    {
      id: 'who-we-are',
      heading: 'Who we are and our role',
      body: (
        <>
          <p>
            {LEGAL.product} is a cloud HR and talent-management platform operated by <strong>{LEGAL.company}</strong>, trading as{' '}
            <strong>{LEGAL.tradingName}</strong> (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;), based in {LEGAL.country}. We handle personal
            information in line with the New Zealand Privacy Act 2020 and its Information Privacy Principles, and we aim to
            meet the expectations of comparable laws in the countries our customers operate in.
          </p>
          <p>We handle personal information in two different capacities:</p>
          <ul>
            <li>
              <strong>As a service provider to our customers.</strong> Organisations that subscribe to {LEGAL.product}{' '}
              (&ldquo;customers&rdquo;) enter information about their employees, job applicants and other people into the
              platform. The customer decides what is collected and why, and is responsible for it (the customer is the
              &ldquo;controller&rdquo; or &ldquo;agency&rdquo; for that information). We hold and process it only to
              provide the service to that customer, on their instructions.
            </li>
            <li>
              <strong>On our own account.</strong> We are responsible for the information we collect to run our business —
              for example the contact and billing details of the person who signs an organisation up, support emails, and
              technical logs.
            </li>
          </ul>
          <p>
            If you are an employee or applicant of one of our customers and have a question about your records, please
            contact that organisation first — they control your information and can access, correct or delete it. We will
            help them respond.
          </p>
        </>
      ),
    },
    {
      id: 'information-collected',
      heading: 'Information we collect',
      body: (
        <>
          <h3>Organisation and account information</h3>
          <ul>
            <li>Organisation name, address, country, currency, time zone, logo and tagline.</li>
            <li>Organisation regulatory identifiers the customer chooses to record (for example tax, pension/superannuation and health-insurance registration numbers).</li>
            <li>
              For each user who signs in: name, login email address, phone number, role (Employee, Supervisor, HR or
              Admin) and a password, which we store only in hashed form.
            </li>
          </ul>

          <h3>Employee records entered by customers</h3>
          <p>Depending on how a customer uses {LEGAL.product}, employee records may include:</p>
          <ul>
            <li>Identity and contact details — name, employee ID, photo, personal and work email, phone numbers, home address.</li>
            <li>Personal details — date of birth, gender, marital status, nationality, blood group, names of parents or spouse, dependants, hobbies.</li>
            <li>Government and statutory identifiers — national ID number, social security / pension number, health-insurance number, tax number.</li>
            <li>Employment details — job title, department, branch, manager, employment type, status history, start date, job history.</li>
            <li>Pay information — salary or pay rate, allowances, additions and deductions, payslips and payroll returns.</li>
            <li>Leave, timesheet, training, performance goals, reviews and notes.</li>
            <li>Documents uploaded by the customer or the employee, such as employment contracts and copies of ID.</li>
          </ul>
          <p>
            Some of this information is sensitive. Customers should only record what they genuinely need for employment
            purposes and have a lawful basis for.
          </p>

          <h3>Job applicants</h3>
          <p>
            When someone applies for a job through a customer&apos;s {LEGAL.product} careers page, we collect what they
            submit on the application form: name, contact details, LinkedIn or portfolio link, expected salary, notice
            period, right-to-work information, education, work experience, skills, CV and cover letter. The application goes
            to the hiring organisation.
          </p>

          <h3>Billing information</h3>
          <p>
            Subscriptions are paid by card through our payment processor, <strong>Stripe</strong>. Card details are
            entered directly on Stripe&apos;s secure pages — <strong>we never see or store full card numbers</strong>. We keep
            the billing email, plan, company-size band, country, subscription status and the reference numbers Stripe
            gives us for the customer and subscription.
          </p>

          <h3>Support and communications</h3>
          <p>Emails and messages you send us (for example to {LEGAL.supportEmail}), and the details you give us when you ask to be contacted by sales.</p>

          <h3>Technical information</h3>
          <ul>
            <li>
              Our servers keep standard logs — IP address, browser type, the page or function requested, date and time, and
              error details — to keep the service secure and working.
            </li>
            <li>
              When you sign in, your browser&apos;s local storage holds a sign-in token and basic profile details so you
              stay signed in, plus your theme and sidebar preferences. We <strong>do not use cookies</strong>, advertising
              trackers or third-party analytics.
            </li>
            <li>
              To show an approximate price in your local currency on our pricing page, your browser works out your likely
              country from its time-zone setting. This happens on your device and is not stored.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: 'use',
      heading: 'How we use information',
      body: (
        <>
          <p>We use personal information to:</p>
          <ul>
            <li>provide the {LEGAL.product} service to customers — storing records, calculating leave and payroll, generating payslips and statutory returns, and showing each user the information their role allows;</li>
            <li>create and secure user accounts, verify sign-ins and send password-reset links;</li>
            <li>send service emails the platform generates, such as leave and timesheet notifications, announcements and account emails;</li>
            <li>set up and manage subscriptions, take payments, send invoices and handle failed payments;</li>
            <li>respond to support requests and sales enquiries;</li>
            <li>monitor, maintain, secure and improve the service, and investigate misuse; and</li>
            <li>meet our legal obligations, such as tax and accounting record-keeping.</li>
          </ul>
          <p>
            We do not sell personal information, use customers&apos; employee data for advertising, or use it for any purpose
            other than providing the service to that customer.
          </p>
        </>
      ),
    },
    {
      id: 'disclosure',
      heading: 'Who we disclose information to',
      body: (
        <>
          <p>We only disclose personal information to the following parties, and only as far as each needs it:</p>
          <ul>
            <li>
              <strong>Within the customer&apos;s own organisation.</strong> Information in a customer&apos;s workspace is
              visible to that customer&apos;s users according to the roles the customer assigns. Other customers can never
              see it.
            </li>
            <li>
              <strong>Stripe</strong> (payment processing) — receives the billing email, organisation name, country, the
              selected plan and the card details you enter on Stripe&apos;s pages, to process subscription payments.
            </li>
            <li>
              <strong>Amazon Web Services (AWS)</strong> — hosts the servers and database on which {LEGAL.product} runs, and
              delivers the emails the platform sends (Amazon Simple Email Service). AWS stores and transmits the data on our
              behalf and does not use it for its own purposes.
            </li>
            <li>
              <strong>The public, for job listings only.</strong> When a customer publishes a vacancy, the job advert (not
              any applicant or employee data) appears on the public careers page.
            </li>
            <li>
              <strong>Professional advisers</strong> such as our accountants, auditors and lawyers, under a duty of
              confidentiality, where needed for their advice.
            </li>
            <li>
              <strong>Authorities</strong>, where we are required to by law, court order or a lawful request, or where
              necessary to prevent a serious threat to someone&apos;s life, health or safety.
            </li>
            <li>
              <strong>A successor business</strong>, if {LEGAL.product} or {LEGAL.company} is sold or restructured, on the
              condition that it continues to protect the information in line with this policy.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: 'method',
      heading: 'How information is disclosed',
      body: (
        <>
          <ul>
            <li>
              <strong>To users in a customer&apos;s organisation</strong> — only through the signed-in {LEGAL.product} web
              application, over an encrypted HTTPS connection, filtered to what the user&apos;s role permits.
            </li>
            <li>
              <strong>To Stripe</strong> — through Stripe&apos;s programming interface (API) over encrypted connections,
              using a restricted access key that only permits billing operations. Card details go straight from your browser
              to Stripe&apos;s own checkout and billing pages.
            </li>
            <li>
              <strong>To AWS</strong> — the data is stored on AWS infrastructure we control; emails are handed to Amazon SES
              over an encrypted connection for delivery to the recipient.
            </li>
            <li>
              <strong>By email notifications</strong> — the platform emails the relevant person about events that concern
              them (for example a leave request awaiting their approval). Emails contain only what is needed and link back to
              the application for detail. Payslips and documents are not sent as email attachments.
            </li>
            <li>
              <strong>To advisers or authorities</strong> — only the minimum information required, by a secure method
              appropriate to the request, and only after we have checked the request is lawful.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: 'international',
      heading: 'Where information is stored',
      body: (
        <p>
          {LEGAL.product} is hosted on AWS data centres, which may be outside your country, and Stripe processes payment
          information in several countries. When information goes overseas, we rely on these providers&apos; contractual
          commitments and security certifications to ensure it is protected to a standard comparable to the New Zealand
          Privacy Act 2020.
        </p>
      ),
    },
    {
      id: 'security',
      heading: 'How we protect information',
      body: (
        <>
          <p>We use technical and organisational safeguards appropriate to HR and payroll data, including:</p>
          <ul>
            <li><strong>Encryption in transit</strong> — all traffic to {LEGAL.product} is served over HTTPS (TLS).</li>
            <li><strong>Encryption at rest</strong> — the servers&apos; storage on AWS is encrypted.</li>
            <li>
              <strong>Tenant isolation</strong> — every organisation&apos;s data is tagged to that organisation, and every
              database query is restricted to the signed-in user&apos;s organisation. Database row-level security adds a
              second, independent barrier on our core tables.
            </li>
            <li><strong>Role-based access</strong> — users see only what their role (Employee, Supervisor, HR, Admin) allows.</li>
            <li>
              <strong>Password protection</strong> — passwords are stored only as one-way bcrypt hashes; password-reset
              links are single-use, expire after one hour and are stored only as a hash. Sign-in sessions expire after 12
              hours, and repeated sign-in and reset attempts are rate-limited.
            </li>
            <li>
              <strong>Temporary passwords</strong> — each new login gets its own random temporary password, which must be
              replaced with the user&apos;s own password at first sign-in.
            </li>
            <li>
              <strong>Access removal</strong> — when a customer records that someone has left, that person can no longer
              sign in, including from sessions already open.
            </li>
            <li><strong>No card data</strong> — card numbers are handled only by Stripe, which is certified to PCI DSS Level 1.</li>
            <li><strong>Least-privilege access</strong> — access to production systems is limited to authorised {LEGAL.company} staff who need it, and our Stripe integration uses a restricted key.</li>
            <li><strong>Firewalled servers</strong> — only the ports needed to serve the application are open to the internet, and the database is not publicly reachable.</li>
            <li><strong>Backups</strong> — the database is backed up so it can be restored after a failure.</li>
          </ul>
          <p>
            No system is completely secure. If we become aware of a privacy breach that is likely to cause serious harm, we
            will notify affected customers and the Office of the Privacy Commissioner as the Privacy Act 2020 requires.
          </p>
          <p>
            Customers are responsible for choosing who gets access in their workspace, assigning appropriate roles, and
            making sure their users keep their passwords private.
          </p>
        </>
      ),
    },
    {
      id: 'retention',
      heading: 'How long we keep information',
      body: (
        <>
          <p>
            We keep a customer&apos;s workspace data for as long as their subscription is active. After a subscription is
            cancelled or ends, we keep the data for {LEGAL.retentionDaysAfterCancel} days so the organisation can come back
            or ask for a copy, and then delete it. Copies in backups are overwritten in the normal backup cycle.
          </p>
          <p>
            We keep billing and invoice records for as long as tax and accounting law requires (in New Zealand, generally
            seven years). Server logs are kept for a short period for security purposes.
          </p>
          <p>
            A customer&apos;s Admin can download a complete copy of their workspace data at any time from Settings →
            Organization → Export all data. Customers can ask us to delete their workspace sooner by emailing{' '}
            {mail(LEGAL.privacyEmail)}.
          </p>
        </>
      ),
    },
    {
      id: 'rights',
      heading: 'Your rights',
      body: (
        <>
          <p>
            You have the right to ask for access to the personal information we hold about you and to ask for it to be
            corrected. For information in an employer&apos;s workspace, please ask your employer first; we will support
            them. For information we hold on our own account, email {mail(LEGAL.privacyEmail)}. We will respond within 20
            working days, as the Privacy Act 2020 requires.
          </p>
          <p>
            If you are not satisfied with how we handle a privacy concern, you can complain to the New Zealand Office of the
            Privacy Commissioner at <a href="https://www.privacy.org.nz" target="_blank" rel="noreferrer">privacy.org.nz</a>,
            or to the privacy regulator in your own country.
          </p>
        </>
      ),
    },
    {
      id: 'children',
      heading: 'Children',
      body: (
        <p>
          {LEGAL.product} is a business service and is not directed at children. Employers may record details of an
          employee&apos;s dependants where needed for employment benefits; that information is handled as described in this
          policy.
        </p>
      ),
    },
    {
      id: 'changes',
      heading: 'Changes to this policy',
      body: (
        <p>
          We may update this policy from time to time. We will post the new version on this page with a new effective date,
          and tell customer administrators by email about significant changes.
        </p>
      ),
    },
    {
      id: 'contact',
      heading: 'Contact us',
      body: (
        <p>
          Questions about this policy or your information: {mail(LEGAL.privacyEmail)}. See also our{' '}
          <Link href="/terms-of-service">Terms of Service</Link> and <Link href="/support">Support centre</Link>.
        </p>
      ),
    },
  ];

  return (
    <LegalDocument
      title="Privacy Policy"
      intro={
        <p>
          This policy explains what information {LEGAL.product} collects, how we use it, who we disclose it to and how, and
          the security practices we use to protect it. It applies to {LEGAL.website.replace('https://', '')} and the{' '}
          {LEGAL.product} application.
        </p>
      }
      sections={sections}
    />
  );
}
