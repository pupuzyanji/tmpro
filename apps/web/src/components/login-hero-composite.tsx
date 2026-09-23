// The login hero's "person summary + Regulatory Submission" composite graphic.
//
// History: this used to be a single flat screenshot (`/login-people-screenshot.png`)
// — low resolution, blurry at the hero panel's display size. Rebuilt as real
// markup for a while (resolution-independent, crisp at any DPI), but the
// People-table "back" card that used to sit behind the other two — a live
// list of employee rows — was removed for good: rendering it as markup on
// the public, pre-auth login screen risked exactly the kind of flash this
// component now goes out of its way to avoid (see below), so it's back to
// being a plain static image, just at a higher resolution than the original.
// The image lives at apps/web/public/login-people-screenshot.png (a static
// screenshot-style PNG generated at 2x, not a live-rendered page — there's
// no real people list loading here).
//
// Styling lives in login-hero-composite.module.css, NOT styled-jsx: styled-jsx
// injects its <style> tag via JavaScript after the page loads, which caused a
// visible flash of unstyled content (raw photo + unstyled text) on every
// reload. A CSS Module compiles to a real stylesheet loaded in <head> before
// the page paints, so there's nothing to flash.
//
// This is marketing artwork shown to every visitor on the public, pre-auth
// login screen — before any tenant is known — so its content (person details,
// financial figures) is illustrative, not live data from any real tmPro
// tenant. The photo is a demo headshot supplied specifically for this
// graphic (apps/web/public/people/).
'use client';

import styles from './login-hero-composite.module.css';

export function LoginHeroComposite() {
  return (
    <div className={styles.stage}>
      <div className={`${styles.heroCard} ${styles.back}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={styles.backImg} src="/login-people-screenshot.png" alt="" />
      </div>

      <div className={`${styles.heroCard} ${styles.person}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="avatar-photo" src="/people/terrence.jpg" alt="" />
        <div>
          <div className={styles.name}>Terrence Banda</div>
          <div className={styles.role}>Budget Specialist · Finance</div>
          <div className={styles.email}>terrence@acme.com</div>
        </div>
      </div>

      <div className={`${styles.heroCard} ${styles.front}`}>
        <div className={styles.badge}>tm</div>
        <div className={styles.tabs}>
          <span>Pay Runs</span>
          <span>Additions &amp; Deductions</span>
          <span className={styles.active}>Regulatory Submission</span>
          <span className={styles.csv}>⬇ CSV</span>
        </div>
        <h4>Regulatory Submission</h4>
        <p className={styles.sub}>Zambia (ZM) · September 2026</p>
        <div className={styles.cols}>
          <span>STATUTORY FILING</span>
          <span>AMOUNT DUE</span>
          <span>STATUS</span>
        </div>
        <div className={styles.row}>
          <span>ZRA — PAYE</span>
          <span>K 184,230.00</span>
          <span className={`${styles.pill} ${styles.ready}`}>Ready</span>
        </div>
        <div className={styles.row}>
          <span>NAPSA — Pension</span>
          <span>K 61,410.00</span>
          <span className={`${styles.pill} ${styles.ready}`}>Ready</span>
        </div>
        <div className={styles.row}>
          <span>NHIMA — Health Levy</span>
          <span>K 24,564.00</span>
          <span className={`${styles.pill} ${styles.filed}`}>Filed</span>
        </div>
      </div>
    </div>
  );
}
