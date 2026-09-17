// The login hero's "People + Regulatory Submission" composite graphic.
//
// History: this used to be a single flat screenshot (`/login-people-screenshot.png`)
// — low resolution, blurry at the hero panel's display size. Rebuilt here as
// real markup (resolution-independent, crisp at any DPI) after four rounds of
// HTML/CSS mockup review landed on "Version 1 — Moderate shift": the
// Regulatory Submission card shifted right so the People table's avatar
// photos and names show behind it, with an attached-tab person-summary card
// tucked just above the People card (no tilt).
//
// This is marketing artwork shown to every visitor on the public, pre-auth
// login screen — before any tenant is known — so its content (org name,
// employee names/photos, financial figures) is illustrative, not live data
// from any real tmPro tenant. The photos are demo headshots supplied
// specifically for this graphic (apps/web/public/people/).
'use client';

const PEOPLE_ROWS: Array<{
  photo: string;
  name: string;
  role?: string;
  dept?: string;
  status?: string;
  highlight?: boolean;
}> = [
  { photo: '/people/precious.jpg', name: 'Precious A…' },
  { photo: '/people/terrence.jpg', name: 'Terrence Banda', role: 'Budget Specialist', dept: 'Finance', highlight: true },
  { photo: '/people/silvia.jpg', name: 'Silvia Chama' },
  { photo: '/people/jeff.jpg', name: 'Jeff Daka', role: 'Chief Executive Officer', dept: 'Sales', status: 'ACTIVE' },
  { photo: '/people/fiona.jpg', name: 'Fiona Feuds', role: 'Service Engineer – Power', dept: 'Engineering', status: 'ACTIVE' },
  { photo: '/people/tom.jpg', name: 'Tom Kimdo', role: 'Director Finance', dept: 'Finance', status: 'ACTIVE' },
];

const NAV_ITEMS = ['Dashboard', 'People', 'Leave', 'Performance', 'Recruitment', 'Payroll', 'Training', 'Documents', 'Reports'];

export function LoginHeroComposite() {
  return (
    <div className="stage">
      <div className="heroCard back">
        <div className="sidebar">
          <div className="logo">
            <span className="dot" />
            tm|Pro
          </div>
          {NAV_ITEMS.map((item) => (
            <div key={item} className={`nav-item${item === 'People' ? ' active' : ''}`}>
              {item}
            </div>
          ))}
        </div>
        <div className="main">
          <div className="org-row">🏢 Acme Group · Talent Management</div>
          <h3>People</h3>
          <p className="sub">23 of 23 employees</p>
          <table>
            <tbody>
              <tr>
                <th />
                <th>EMPLOYEE</th>
                <th />
                <th />
                <th />
              </tr>
              {PEOPLE_ROWS.map((r) => (
                <tr key={r.name} className={r.highlight ? 'highlight' : undefined}>
                  <td className="avatar-cell">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={r.photo} alt="" />
                  </td>
                  <td>{r.name}</td>
                  <td className="role">{r.role ?? ''}</td>
                  <td className="role">{r.dept ?? ''}</td>
                  <td className="status">{r.status ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="heroCard person">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="avatar-photo" src="/people/terrence.jpg" alt="" />
        <div>
          <div className="name">Terrence Banda</div>
          <div className="role">Budget Specialist · Finance</div>
          <div className="email">terrence@acme.com</div>
        </div>
      </div>

      <div className="heroCard front">
        <div className="badge">tm</div>
        <div className="tabs">
          <span>Pay Runs</span>
          <span>Additions &amp; Deductions</span>
          <span className="active">Regulatory Submission</span>
          <span className="csv">⬇ CSV</span>
        </div>
        <h4>Regulatory Submission</h4>
        <p className="sub">Zambia (ZM) · September 2026</p>
        <div className="cols">
          <span>STATUTORY FILING</span>
          <span>AMOUNT DUE</span>
          <span>STATUS</span>
        </div>
        <div className="row">
          <span>ZRA — PAYE</span>
          <span>K 184,230.00</span>
          <span className="pill ready">Ready</span>
        </div>
        <div className="row">
          <span>NAPSA — Pension</span>
          <span>K 61,410.00</span>
          <span className="pill ready">Ready</span>
        </div>
        <div className="row">
          <span>NHIMA — Health Levy</span>
          <span>K 24,564.00</span>
          <span className="pill filed">Filed</span>
        </div>
      </div>

      <style jsx>{`
        .stage {
          position: relative;
          width: 640px;
          max-width: 100%;
          height: 340px;
          margin: 0 auto;
          transform-origin: top left;
        }
        @media (max-width: 720px) {
          .stage {
            transform: scale(0.72);
            margin-bottom: -95px;
          }
        }

        .heroCard {
          position: absolute;
          background: #fff;
          border-radius: 16px;
          box-shadow: 0 20px 45px -18px rgba(10, 8, 30, 0.55);
          overflow: hidden;
        }

        .back {
          left: 0;
          top: 26px;
          width: 470px;
          height: 300px;
          display: flex;
        }
        .back .sidebar {
          width: 118px;
          flex-shrink: 0;
          background: linear-gradient(180deg, #2a1f66 0%, #3b2789 60%, #5b2794 100%);
          padding: 14px 10px;
        }
        .back .logo {
          display: flex;
          align-items: center;
          gap: 6px;
          color: #fff;
          font-weight: 800;
          font-size: 12px;
          margin-bottom: 14px;
          padding-left: 2px;
        }
        .back .logo .dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: linear-gradient(135deg, #14b8f0, #8b2fd9, #ff8a1e);
          display: inline-block;
        }
        .back .nav-item {
          color: rgba(255, 255, 255, 0.75);
          font-size: 10px;
          font-weight: 500;
          padding: 5px 8px;
          border-radius: 6px;
          margin-bottom: 1px;
        }
        .back .nav-item.active {
          background: rgba(255, 255, 255, 0.16);
          color: #fff;
          font-weight: 700;
        }
        .back .main {
          flex: 1;
          padding: 14px 16px;
          min-width: 0;
        }
        .back .org-row {
          font-size: 9px;
          color: #8a8698;
          margin-bottom: 8px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .back .main h3 {
          margin: 0;
          font-size: 15px;
          color: #181524;
          font-weight: 800;
        }
        .back .main .sub {
          margin: 1px 0 8px;
          font-size: 9.5px;
          color: #a3a0b0;
        }
        .back table {
          width: 100%;
          border-collapse: collapse;
        }
        .back th {
          text-align: left;
          font-size: 8px;
          color: #a3a0b0;
          font-weight: 700;
          padding-bottom: 4px;
          border-bottom: 1px solid #f4f3f7;
        }
        .back td {
          font-size: 10px;
          color: #3a3650;
          padding: 5px 4px;
          border-bottom: 1px solid #f6f5fa;
          white-space: nowrap;
        }
        .back td.avatar-cell {
          width: 16px;
          padding-right: 5px;
        }
        .back td.avatar-cell img {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          object-fit: cover;
          display: block;
        }
        .back td.role {
          color: #8a8698;
        }
        .back td.status {
          color: #0f9d63;
          font-weight: 700;
          font-size: 8.5px;
        }
        .back tr.highlight td {
          background: #f3f1fb;
        }

        .person {
          left: 22px;
          top: 8px;
          width: 224px;
          padding: 11px 12px;
          display: flex;
          align-items: center;
          gap: 10px;
          border-radius: 12px 12px 8px 8px;
          z-index: 3;
        }
        .person :global(.avatar-photo) {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          object-fit: cover;
          flex-shrink: 0;
          box-shadow: 0 0 0 2px #fff, 0 0 0 3.5px rgba(139, 47, 217, 0.35);
        }
        .person .name {
          font-size: 12px;
          font-weight: 800;
          color: #181524;
          line-height: 1.25;
        }
        .person .role {
          font-size: 9.5px;
          color: #6d6880;
          margin-top: 1px;
        }
        .person .email {
          font-size: 9px;
          color: #a3a0b0;
          margin-top: 1px;
        }

        .front {
          left: 230px;
          top: 96px;
          width: 300px;
          padding: 14px 16px 16px;
          z-index: 2;
        }
        .front .badge {
          position: absolute;
          top: 10px;
          right: 12px;
          width: 20px;
          height: 20px;
          border-radius: 6px;
          background: linear-gradient(135deg, #14b8f0, #2b3af5, #8b2fd9);
          box-shadow: 0 8px 16px -6px rgba(43, 58, 245, 0.5);
          color: #fff;
          font-size: 9px;
          font-weight: 800;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .front .tabs {
          display: flex;
          gap: 10px;
          font-size: 8.5px;
          color: #9691a3;
          font-weight: 600;
          margin-bottom: 10px;
          padding-right: 26px;
        }
        .front .tabs .active {
          color: #2b3af5;
          padding-bottom: 3px;
          border-bottom: 1.5px solid #2b3af5;
        }
        .front .tabs .csv {
          margin-left: auto;
          color: #9691a3;
        }
        .front h4 {
          margin: 0;
          font-size: 13px;
          color: #181524;
          font-weight: 800;
        }
        .front .sub {
          margin: 1px 0 10px;
          font-size: 9px;
          color: #a3a0b0;
        }
        .front .cols {
          display: flex;
          font-size: 7.5px;
          font-weight: 700;
          color: #9691a3;
          padding-bottom: 5px;
          border-bottom: 1px solid #f6f5fa;
          margin-bottom: 4px;
        }
        .front .cols span:first-child {
          flex: 1.6;
        }
        .front .cols span:nth-child(2) {
          flex: 1;
        }
        .front .cols span:last-child {
          flex: 0.7;
          text-align: right;
        }
        .front .row {
          display: flex;
          align-items: center;
          font-size: 9.5px;
          color: #3a3650;
          padding: 5px 0;
          border-bottom: 1px solid #f6f5fa;
        }
        .front .row span:first-child {
          flex: 1.6;
          font-weight: 600;
        }
        .front .row span:nth-child(2) {
          flex: 1;
          color: #6d6880;
        }
        .front .row span:last-child {
          flex: 0.7;
          text-align: right;
        }
        .front .pill {
          display: inline-block;
          padding: 2px 7px;
          border-radius: 999px;
          font-size: 8px;
          font-weight: 700;
        }
        .front .pill.ready {
          background: #eaf1ff;
          color: #2b3af5;
        }
        .front .pill.filed {
          background: #e6f7ee;
          color: #0f9d63;
        }
      `}</style>
    </div>
  );
}
