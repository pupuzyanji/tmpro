// v026.A — Support knowledge base. Every article describes the app as it
// actually behaves; update the matching article when a workflow changes.
// Menu paths are written "Settings → Employees" and button labels in quotes
// exactly as they appear on screen.

export const CATEGORIES = [
  'Getting started',
  'Signing in',
  'People',
  'Leave',
  'Timesheets',
  'Payroll',
  'Recruitment',
  'Performance & training',
  'Documents & announcements',
  'Billing & plans',
  'Privacy & security',
] as const;
export type Category = (typeof CATEGORIES)[number];

export interface Article {
  slug: string;
  category: Category;
  title: string;
  summary: string;
  /** Who can do this, e.g. "Admin" or "Admin, HR". */
  who?: string;
  steps?: string[];
  body?: string[];
  tip?: string;
  tags?: string[];
}

export const ARTICLES: Article[] = [
  // ---------------------------------------------------------------- Getting started
  {
    slug: 'getting-started-checklist',
    category: 'Getting started',
    title: 'Setting up your workspace: a first-day checklist',
    summary: 'The order that gets a new tmPro workspace ready fastest.',
    who: 'Admin',
    steps: [
      'Settings → Organization: add your organisation name, logo, address, country, currency, time zone and working hours, plus your tax, superannuation/pension and health-insurance registration numbers. Click "Save".',
      'Settings → Branches: add each office or site ("New branch").',
      'Settings → Departments: add departments, and sections inside them if you use them.',
      'Settings → Designations: add job titles and who each one reports to. This builds your Org Chart.',
      'Settings → Leave: choose your country and check the leave rules (days accrued, accrual period, carry-over).',
      'Settings → Employees: add your people one by one or import a CSV file.',
      'Give each person a login from People → (person) → Permission → "Generate Login".',
    ],
    tip: 'Payroll uses each employee\'s country to apply the right tax and statutory rules, so set the country on every employee.',
    tags: ['setup', 'onboarding', 'new account', 'configure', 'organisation', 'organization'],
  },
  {
    slug: 'roles-explained',
    category: 'Getting started',
    title: 'User roles: Employee, Supervisor, HR and Admin',
    summary: 'What each role can see and do.',
    body: [
      'Employee — sees their own profile, leave, timesheets, payslips, goals, courses and documents.',
      'Supervisor — everything an Employee can do, plus approving their team\'s leave and timesheets, assigning courses, raising job requisitions and running reports. tmPro makes someone a Supervisor automatically when their login is created if anyone reports to them.',
      'HR — manages people, employee records, leave settings, payroll, recruitment, training, documents and announcements.',
      'Admin — everything HR can do, plus organisation settings, branches, departments, designations and billing.',
    ],
    steps: [
      'To change a role: People → (person) → Permission → choose the Role → "Save". The person must already have a login. You cannot change your own role.',
      'Only an Admin can give someone the Admin role, or change an existing Admin\'s role, login email or password.',
    ],
    tags: ['permissions', 'access', 'manager', 'supervisor', 'admin', 'hr', 'role'],
  },
  {
    slug: 'country-customisation',
    category: 'Getting started',
    title: 'Using tmPro in your country',
    summary: 'How country-specific tax, statutory and leave rules work.',
    body: [
      'Payroll tax and statutory deductions are built in for each supported country and applied by each employee\'s country — for example PAYE, NAPSA and NHIMA in Zambia.',
      'Leave rules are set per country under Settings → Leave.',
      'Your organisation\'s currency, time zone and regulatory registration numbers are set under Settings → Organization.',
      'If your country isn\'t listed yet, or a rate has changed, email us@bitware.app — we add and update country rules for customers.',
    ],
    tags: ['country', 'localisation', 'localization', 'tax', 'statutory', 'currency', 'customisation', 'customization'],
  },

  // ---------------------------------------------------------------- Signing in
  {
    slug: 'sign-in',
    category: 'Signing in',
    title: 'How to sign in',
    summary: 'tmPro asks for your email first, then your password.',
    steps: [
      'Go to tmpro.bitware.app/login.',
      'Enter your work email and click "Continue".',
      'If your email is used at more than one organisation, choose the one you want.',
      'Enter your password and click "Sign in".',
    ],
    tip: 'You stay signed in for up to 12 hours. After that you\'ll be asked to sign in again.',
    tags: ['login', 'log in', 'signin', 'email', 'password'],
  },
  {
    slug: 'forgot-password',
    category: 'Signing in',
    title: 'I forgot my password',
    summary: 'Get a reset link from the sign-in page.',
    steps: [
      'Go to tmpro.bitware.app/login, enter your email and click "Continue".',
      'On the password screen, click "Forgot password?".',
      'Check your email for a reset link. It works once and expires after one hour.',
      'Open the link, enter your new password twice and click "Set new password".',
    ],
    tip: 'The link goes to your login email address. If it doesn\'t arrive, check your spam folder, or ask your Admin or HR team to send one from People → (your name) → Permission → "Reset password".',
    tags: ['reset', 'forgot', 'locked out', 'password', 'forgotten'],
  },
  {
    slug: 'change-password',
    category: 'Signing in',
    title: 'Change your password',
    summary: 'Change your own password at any time from the sidebar.',
    steps: [
      'Click your email address at the bottom of the left sidebar.',
      'Enter your current password, then your new password twice (at least 8 characters).',
      'Click "Save".',
    ],
    tip: 'If you were given a temporary password, tmPro asks you to choose your own the first time you sign in.',
    tags: ['password', 'security', 'temporary password'],
  },
  {
    slug: 'give-login',
    category: 'Signing in',
    title: 'Give an employee a login',
    summary: 'Create sign-in access for someone already in tmPro.',
    who: 'Admin, HR',
    steps: [
      'Open People → (person) → General Info and make sure their personal email is filled in. It becomes their login email.',
      'Go to the Permission tab and click "Generate Login".',
      'tmPro creates a unique temporary password, emails it to them, and shows it to you once so you can pass it on.',
      'The first time they sign in, they must choose their own password before they can use tmPro.',
    ],
    tip: 'To change someone\'s login email later, use Permission → Account email. Both the old and new addresses are notified.',
    tags: ['invite', 'account', 'access', 'login', 'new user'],
  },
  {
    slug: 'theme',
    category: 'Signing in',
    title: 'Switch between Classic and Midnight themes',
    summary: 'Choose a light or dark look for tmPro.',
    steps: ['Use the theme switch at the bottom of the left sidebar. Your choice is remembered on that device.'],
    tags: ['dark mode', 'appearance', 'theme', 'midnight'],
  },

  // ---------------------------------------------------------------- People
  {
    slug: 'add-employee',
    category: 'People',
    title: 'Add an employee',
    summary: 'Create a new employee record.',
    who: 'Admin, HR',
    steps: [
      'Go to Settings → Employees and click "Add employee".',
      'Fill in their name, employee ID, country, branch, designation, department, section, direct manager ("Reports to"), employment type, source of hire and work phone.',
      'Click "Create employee".',
      'Open the person under People to add personal details, job and pay information on the General Info and Job tabs.',
    ],
    tip: 'If you\'ve reached your plan\'s employee limit, tmPro asks you to move to a larger size under Settings → Billing first.',
    tags: ['new employee', 'hire', 'create', 'staff'],
  },
  {
    slug: 'import-employees',
    category: 'People',
    title: 'Import employees from a CSV file',
    summary: 'Add many employees at once from a spreadsheet.',
    who: 'Admin, HR',
    steps: [
      'Go to Settings → Employees and click "Sample CSV" to download the template.',
      'Fill in one row per employee: firstName, lastName, employeeCode, jobTitle, countryCode, managerCode, sourceOfHire, workPhone, employmentType. You can also add branch, department, section and designation columns; these must match names already set up in Settings.',
      'employmentType must be FULL_TIME, PART_TIME, CONTRACT or INTERN.',
      'Save the file as CSV and click "Data Import (CSV)".',
      'tmPro tells you how many rows were imported and lists any rows it skipped, with the reason.',
    ],
    tags: ['csv', 'bulk', 'upload', 'spreadsheet', 'excel', 'import'],
  },
  {
    slug: 'employee-leaves',
    category: 'People',
    title: 'When an employee leaves the organisation',
    summary: 'Record a departure so payroll and your employee count update.',
    who: 'Admin, HR',
    steps: [
      'Open People → (person) → Job tab.',
      'In the Employee status card, add a new entry with status ALUMNI and the date they leave. Add a comment if you like.',
    ],
    body: [
      'From that date they can no longer sign in to tmPro — including any session they already have open. If you date it in the future, they keep access until then.',
      'Former staff (ALUMNI) no longer count towards your plan\'s employee limit, and payroll stops from the effective date. Their records are kept for your history.',
      'To restore access (for example if they return), add a new ACTIVE status entry.',
      'Use OFFBOARDING for people who are working their notice period, and ON LEAVE for extended absences.',
    ],
    tags: ['terminate', 'resign', 'offboard', 'alumni', 'former', 'deactivate', 'exit'],
  },
  {
    slug: 'org-chart',
    category: 'People',
    title: 'View or download the organisation chart',
    summary: 'The org chart is built from designations and reporting lines.',
    steps: [
      'Set who each designation reports to under Settings → Designations.',
      'Open Settings → Org Chart to see the chart.',
      'Click "Download PDF" to save or print it.',
    ],
    tags: ['org chart', 'hierarchy', 'structure', 'reporting lines', 'pdf'],
  },

  // ---------------------------------------------------------------- Leave
  {
    slug: 'request-leave',
    category: 'Leave',
    title: 'Request leave',
    summary: 'Apply for leave and track your requests.',
    who: 'Employee, Supervisor',
    steps: [
      'Go to Leave and click "Request leave".',
      'Choose the leave type, start and end dates, and add a reason if you like.',
      'Click "Submit request". Your supervisor is notified by email.',
      'Track progress under "Your requests"; your remaining days are under "Your entitlements".',
    ],
    tags: ['apply', 'holiday', 'annual leave', 'sick leave', 'vacation', 'time off'],
  },
  {
    slug: 'approve-leave',
    category: 'Leave',
    title: 'Approve or decline leave',
    summary: 'Supervisors respond to their team\'s leave requests.',
    who: 'Supervisor',
    steps: [
      'Go to Leave. Pending requests from your team are listed under "Team approvals".',
      'Click "Approve" or "Decline". The employee is notified by email.',
    ],
    tip: 'Admin and HR can see anyone\'s balances and leave history from People → (person) → Leave.',
    tags: ['approve', 'decline', 'reject', 'manager', 'team'],
  },
  {
    slug: 'leave-settings',
    category: 'Leave',
    title: 'Set up leave types, accrual and carry-over',
    summary: 'Configure how leave is earned in each country.',
    who: 'Admin, HR',
    steps: [
      'Go to Settings → Leave and choose the country.',
      'For each leave type set the number of days accrued, the accrual period (Daily, Monthly or Annually), whether unused days carry over or reset on 1 January, and whether it is unpaid.',
      'Click "Update".',
    ],
    body: [
      'Balances are calculated automatically: days earned so far minus days taken. With carry-over on, days are counted from the employee\'s start date; otherwise from 1 January.',
      'Employees in a country you haven\'t configured use the "Other" rules.',
    ],
    tags: ['accrual', 'entitlement', 'balance', 'carry over', 'leave policy'],
  },

  // ---------------------------------------------------------------- Timesheets
  {
    slug: 'submit-timesheet',
    category: 'Timesheets',
    title: 'Submit a timesheet',
    summary: 'Record the hours you worked.',
    who: 'Employees with timesheets turned on',
    steps: [
      'Go to Timesheets → My Timesheets.',
      'Click "Add Timesheet" for a single day or "Add Weekly Timesheet" for a week.',
      'Enter the date, start and end times, breaks, work site, position, work type and any notes, then save.',
    ],
    tip: 'You can edit or delete an entry until it has been approved. If you don\'t see Timesheets, ask HR to turn it on for you in Settings → Employees.',
    tags: ['hours', 'time', 'clock', 'weekly'],
  },
  {
    slug: 'approve-timesheets',
    category: 'Timesheets',
    title: 'Approve timesheets',
    summary: 'Review and approve submitted hours.',
    who: 'Supervisor, HR, Admin',
    steps: [
      'Go to Timesheets → Review. Supervisors see their team; Admin and HR see everyone.',
      'Click "Approve" or "Decline". The employee is notified by email.',
    ],
    tags: ['approve', 'hours', 'review'],
  },

  // ---------------------------------------------------------------- Payroll
  {
    slug: 'set-pay',
    category: 'Payroll',
    title: 'Set an employee\'s pay',
    summary: 'Record salary, pay type and allowances.',
    who: 'Admin, HR',
    steps: [
      'Open People → (person) → Job → Compensation.',
      'Enter the basic pay rate, pay type, hours per week and any allowances (housing, transport, meal, other).',
      'Save. Changes are kept as a dated history.',
    ],
    tags: ['salary', 'wage', 'compensation', 'allowance', 'pay rate'],
  },
  {
    slug: 'run-payroll',
    category: 'Payroll',
    title: 'Run payroll',
    summary: 'Calculate pay and statutory deductions for a period.',
    who: 'Admin, HR',
    steps: [
      'Go to Payroll → Pay Runs.',
      'Enter the period start and end dates and choose the country.',
      'Click "Run payroll". Every employee in that country is included, pro-rated for joiners, leavers and status changes.',
      'Click the run to check each employee\'s payslip before paying.',
      'Use "Edit" to change a run\'s status to PAID once staff have been paid.',
    ],
    tip: 'To recalculate a run after changing someone\'s pay, delete the run and run it again.',
    tags: ['payroll', 'pay run', 'salaries', 'paye', 'tax', 'deductions'],
  },
  {
    slug: 'additions-deductions',
    category: 'Payroll',
    title: 'Add a bonus or a deduction',
    summary: 'Schedule one-off or repeating additions and deductions.',
    who: 'Admin, HR',
    steps: [
      'Go to Payroll → Additions & Deductions.',
      'Choose Addition (for example a bonus) or Deduction (for example an advance repayment), and enter a label and the amount per pay run.',
      'Set how many pay runs it applies over, choose the employees and click "Schedule".',
    ],
    tags: ['bonus', 'deduction', 'advance', 'loan', 'overtime'],
  },
  {
    slug: 'statutory-returns',
    category: 'Payroll',
    title: 'Generate statutory returns',
    summary: 'Produce tax, pension and health-insurance return files.',
    who: 'Admin, HR',
    steps: [
      'Go to Payroll → Regulatory Submission.',
      'Choose the return (for example PAYE, NAPSA or NHIMA), month and year.',
      'Click "Generate Return File" or "Export to CSV", check it, and submit it to the authority.',
    ],
    tip: 'Always check returns before filing. Tell us at us@bitware.app if a statutory rate has changed.',
    tags: ['paye', 'napsa', 'nhima', 'return', 'tax', 'pension', 'superannuation', 'zra', 'export'],
  },
  {
    slug: 'payslips',
    category: 'Payroll',
    title: 'View and print your payslip',
    summary: 'Find your payslip for any month.',
    who: 'Employee, Supervisor',
    steps: ['Go to Payroll → "Your payslips".', 'Choose the month and year and click "View Payslip".', 'Click "Print" to print or save it as a PDF.'],
    tags: ['payslip', 'pay slip', 'salary slip', 'print', 'pdf'],
  },

  // ---------------------------------------------------------------- Recruitment
  {
    slug: 'raise-requisition',
    category: 'Recruitment',
    title: 'Raise and approve a job requisition',
    summary: 'Request a new hire and get it approved.',
    who: 'Supervisor, HR, Admin (approval: HR, Admin)',
    steps: [
      'Go to Recruitment → Requisitions and click "Raise requisition".',
      'Enter the role title, department, headcount, target start date, employment type and location.',
      'HR or Admin clicks "Approve".',
    ],
    tags: ['vacancy', 'hiring', 'job', 'requisition', 'headcount'],
  },
  {
    slug: 'publish-job',
    category: 'Recruitment',
    title: 'Advertise a job on your careers page',
    summary: 'Publish an approved requisition so people can apply online.',
    who: 'HR, Admin',
    steps: [
      'Open the requisition and click "Public listing".',
      'Describe the role: your role, what you\'ll do, what you\'ll bring, what you\'ll get, why us and the required skills. Click "Save listing".',
      'Once the requisition is approved, the job appears on your public careers page and in the job search at tmpro.bitware.app/careers.',
    ],
    tags: ['careers', 'job ad', 'advert', 'publish', 'listing', 'vacancy'],
  },
  {
    slug: 'review-applications',
    category: 'Recruitment',
    title: 'Review job applications',
    summary: 'Read CVs and cover letters from applicants.',
    who: 'HR, Admin',
    steps: ['Go to Recruitment → Application Review.', 'Open an application to see the candidate\'s details, then click "View CV" or "View Cover Letter".'],
    tip: 'Applicants don\'t need an account. They apply directly from your careers page and upload a CV of up to 2 MB.',
    tags: ['applicants', 'candidates', 'cv', 'resume', 'applications'],
  },

  // ---------------------------------------------------------------- Performance & training
  {
    slug: 'goals',
    category: 'Performance & training',
    title: 'Set and update your goals',
    summary: 'Track your own performance goals.',
    steps: ['Go to Performance.', 'Add a goal under "Your goals".', 'Click a goal to move it from Not started to In progress to Completed.'],
    tags: ['goals', 'objectives', 'okr', 'performance'],
  },
  {
    slug: 'performance-review',
    category: 'Performance & training',
    title: 'Record a performance review',
    summary: 'Rate an employee and keep review history.',
    who: 'Admin, HR',
    steps: [
      'Open People → (person) → Performance.',
      'Add a review: reviewer, date, and ratings from 1 to 5 for attendance, communication, dependability, job knowledge and work quality.',
      'tmPro works out the average score. You can also add comments and goals for the employee here.',
    ],
    tags: ['appraisal', 'review', 'rating', 'evaluation'],
  },
  {
    slug: 'training-courses',
    category: 'Performance & training',
    title: 'Create, assign and complete training courses',
    summary: 'Build a course library and track completion.',
    who: 'Create: Admin, HR · Assign: Supervisor, HR, Admin',
    steps: [
      'Settings → Training → "Add course": enter a title and course link (YouTube videos play inside tmPro). Add an image and quiz if you like, then "Publish" it.',
      'Training → Assign Courses: choose the course and the people.',
      'Employees open Training → My Courses, then "Take quiz" or "Mark as complete".',
    ],
    tags: ['lms', 'learning', 'course', 'quiz', 'training'],
  },

  // ---------------------------------------------------------------- Documents & announcements
  {
    slug: 'documents',
    category: 'Documents & announcements',
    title: 'Upload and find documents',
    summary: 'Keep contracts, IDs and other files with the employee record.',
    body: [
      'Employees upload their own files under Documents → My Documents, choosing Contract, ID or Other. Files can be PDF or images up to 2 MB.',
      'Admin and HR see every document in the organisation, grouped by type, and can upload documents on a person\'s profile (People → person → Documents).',
      'Reports → "Contract copies not on file" and "ID copies not on file" show who is missing documents.',
    ],
    tags: ['upload', 'contract', 'id', 'file', 'pdf', 'documents'],
  },
  {
    slug: 'announcements',
    category: 'Documents & announcements',
    title: 'Send an announcement',
    summary: 'Share news with everyone or a department.',
    who: 'Admin, HR',
    steps: [
      'Go to Settings → Announcements → New announcement.',
      'Enter a title and message and choose the audience: the entire organisation, a department or a section.',
      'Click "Send". It\'s emailed to the audience and shown on their Dashboard.',
    ],
    tags: ['news', 'broadcast', 'message', 'notice', 'email'],
  },
  {
    slug: 'reports',
    category: 'Documents & announcements',
    title: 'Run a report',
    summary: 'See leave, performance and compliance reports.',
    who: 'Admin, HR, Supervisor',
    steps: ['Go to Reports.', 'Choose a report and a From/To date range, then click "Run report".'],
    body: [
      'Available reports: leave days accumulated, performance goals set, performance appraisals conducted, unresponded requests per supervisor, contract copies not on file, and ID copies not on file.',
    ],
    tags: ['reports', 'analytics', 'compliance'],
  },

  // ---------------------------------------------------------------- Billing
  {
    slug: 'trial',
    category: 'Billing & plans',
    title: 'How the free trial works',
    summary: 'Seven days free, then monthly billing unless you cancel.',
    body: [
      'Every new subscription starts with a 7-day free trial. A Visa or Mastercard credit or debit card is needed to start, but nothing is charged during the trial.',
      'Your card is charged the monthly price when the trial ends. Cancel before then under Settings → Billing → "Manage payment & invoices" and you won\'t be charged.',
    ],
    tags: ['trial', 'free', 'card', 'charge'],
  },
  {
    slug: 'change-plan',
    category: 'Billing & plans',
    title: 'Change your plan or company size',
    summary: 'Move between Core, Growth and Pro, or change your employee band.',
    who: 'Admin',
    steps: [
      'Go to Settings → Billing.',
      'Choose a company size, then click Upgrade, Downgrade or Switch on the plan you want.',
      'Click "Confirm change".',
    ],
    body: [
      'Upgrades take effect immediately, and the prorated difference for the rest of the month is charged to your card today.',
      'Downgrades take effect immediately and the lower price applies from your next invoice. Your data in any removed modules is kept.',
      'You can\'t choose a size smaller than your current number of employees. More than 200 employees? Email us@bitware.app for custom pricing.',
    ],
    tags: ['upgrade', 'downgrade', 'plan', 'band', 'size', 'seats', 'employees limit'],
  },
  {
    slug: 'update-card',
    category: 'Billing & plans',
    title: 'Update your card or download invoices',
    summary: 'Manage payment details on Stripe\'s secure billing page.',
    who: 'Admin',
    steps: [
      'Go to Settings → Billing and click "Manage payment & invoices".',
      'On the secure Stripe page you can change your card, download invoices and receipts, and update your billing details.',
    ],
    tags: ['card', 'visa', 'mastercard', 'invoice', 'receipt', 'payment method'],
  },
  {
    slug: 'payment-failed',
    category: 'Billing & plans',
    title: 'My payment failed',
    summary: 'What happens when a card payment doesn\'t go through.',
    body: [
      'A red banner appears in tmPro and the card is retried automatically over the next few days. You can keep using tmPro meanwhile.',
      'To fix it, go to Settings → Billing → "Manage payment & invoices" and update your card. Check with your bank that international (USD) online payments are allowed.',
      'If payment still fails after the retries, the subscription ends and sign-in is paused until it\'s paid. Your data is kept for 90 days.',
    ],
    tags: ['declined', 'failed', 'past due', 'overdue', 'card', 'suspended'],
  },
  {
    slug: 'cancel',
    category: 'Billing & plans',
    title: 'Cancel your subscription',
    summary: 'Stop renewal at the end of the paid month.',
    who: 'Admin',
    steps: ['Go to Settings → Billing → "Manage payment & invoices".', 'Click "Cancel subscription" on the Stripe page and confirm.'],
    body: [
      'You keep access until the end of the month you\'ve paid for and won\'t be charged again. We keep your data for 90 days in case you come back or want a copy; after that it\'s deleted.',
      'Before cancelling, download a copy of your data from Settings → Organization → "Export all data".',
    ],
    tags: ['cancel', 'stop', 'close account', 'unsubscribe', 'refund'],
  },
  {
    slug: 'currency',
    category: 'Billing & plans',
    title: 'Which currency will I be charged in?',
    summary: 'Prices are charged in US dollars.',
    body: [
      'tmPro prices are set and charged in US dollars (USD). The local-currency amounts on the pricing page are estimates to help you compare.',
      'Your bank converts the charge to your card\'s currency and may add a foreign-transaction fee.',
    ],
    tags: ['usd', 'currency', 'kwacha', 'rand', 'exchange rate', 'conversion'],
  },

  // ---------------------------------------------------------------- Privacy & security
  {
    slug: 'data-security',
    category: 'Privacy & security',
    title: 'How tmPro keeps your data safe',
    summary: 'The main security measures protecting your workspace.',
    body: [
      'All connections are encrypted (HTTPS), and data is stored on encrypted AWS infrastructure.',
      'Each organisation\'s data is kept separate: every request is limited to your organisation, and database row-level security adds a second barrier.',
      'Passwords are stored only as one-way hashes. Every new login gets its own temporary password that must be changed at first sign-in. Sign-ins expire after 12 hours.',
      'When someone is marked as having left (Alumni), they can no longer sign in.',
      'Card payments are handled entirely by Stripe; tmPro never sees or stores card numbers.',
    ],
    tip: 'Read the full Privacy Policy at tmpro.bitware.app/privacy-policy.',
    tags: ['security', 'encryption', 'privacy', 'gdpr', 'safe', 'data protection'],
  },
  {
    slug: 'export-data',
    category: 'Privacy & security',
    title: 'Export all your organisation\'s data',
    summary: 'Download everything in your workspace as spreadsheets in a ZIP file.',
    who: 'Admin',
    steps: [
      'Go to Settings → Organization.',
      'Under "Export all data", click "Export all data".',
      'A ZIP file downloads with one CSV spreadsheet per type of record (employees, leave, payroll and so on) and a files folder with uploaded documents, photos and CVs.',
    ],
    tip: 'The export contains personal and pay information — store it securely. Passwords are never included.',
    tags: ['export', 'download', 'backup', 'csv', 'zip', 'data', 'migrate'],
  },
  {
    slug: 'data-request',
    category: 'Privacy & security',
    title: 'Request a copy or deletion of your data',
    summary: 'How organisations and individuals can make privacy requests.',
    body: [
      'Organisations: an Admin can download a full copy at any time from Settings → Organization → "Export all data". To have your workspace deleted, email us@bitware.app from your Admin\'s address.',
      'Employees and applicants: your employer controls your records, so contact your HR team first. They can view and correct your information in tmPro, and we\'ll help them with anything else.',
    ],
    tags: ['export', 'delete', 'privacy', 'personal information', 'access request'],
  },
];
