/**
 * The "AI ATS" (Application Tracking System) scorer referenced by the
 * Recruitment → Application Review screen. There's no external AI/LLM API
 * wired into this build (see the framework doc), so "AI" here means a
 * deterministic skill-matching engine — the same shape of thing a real ATS
 * does under the hood: it lowercases and tokenizes the job's required-skill
 * list and every text surface a candidate gave us (their explicit Skills
 * tags, their CV/cover-letter text if it could be extracted, and their
 * Education/Work Experience entries and application-question answers), then
 * checks each required skill for a whole-word match anywhere in that
 * combined text. It is intentionally simple and explainable rather than
 * probabilistic — a recruiter can see exactly why a candidate scored what
 * they did (matchedSkills / missingSkills), which matters more here than
 * marginal accuracy.
 */

export interface EducationEntry {
  school?: string;
  degree?: string;
  fieldOfStudy?: string;
  startYear?: string;
  endYear?: string;
}

export interface WorkExperienceEntry {
  company?: string;
  title?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
}

/** Parses a JSON array the frontend sent as a form field (education/workExperience/skills
 *  all travel this way over multipart — see ApplyDto). Never throws: a candidate-supplied
 *  field that isn't valid JSON, isn't an array, or is absurdly long just becomes empty
 *  rather than failing the whole application. `maxItems` guards against a malicious or
 *  buggy client trying to stuff thousands of rows into one application. */
export function parseJsonArray<T>(raw: string | undefined, maxItems = 20): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, maxItems) as T[];
  } catch {
    return [];
  }
}

/** Best-effort plain-text extraction from an uploaded CV/cover letter. Only
 *  PDF is attempted (the other allowed upload type, images, has no text to
 *  extract without OCR, which this build doesn't have) — and even for a PDF,
 *  a scanned/image-only or malformed file can fail to parse. Either way this
 *  never throws: a failed extraction just means that document doesn't
 *  contribute to the ATS match, not that the application fails. */
export async function extractPdfText(file: Express.Multer.File | undefined): Promise<string | null> {
  if (!file || file.mimetype !== 'application/pdf') return null;
  try {
    // Lazy require — keeps pdf-parse (and its own transitive deps) out of
    // the hot path for every request that isn't a résumé upload.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfParse = require('pdf-parse');
    const result = await pdfParse(file.buffer);
    const text = (result?.text ?? '').trim();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9+.# ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Whole-word-ish containment check: "react" matches "React.js developer"
 *  but "java" alone doesn't match inside "javascript" (both sides get
 *  normalized, then bounded by non-alphanumeric characters or the edges of
 *  the haystack). Good enough for skill tags, which are usually short nouns
 *  or acronyms rather than full sentences. */
function haystackHasSkill(haystack: string, skill: string): boolean {
  const needle = normalize(skill);
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i');
  return pattern.test(` ${haystack} `);
}

export interface CandidateAtsInputs {
  skills: string[];
  resumeText: string | null;
  coverLetterText: string | null;
  education: EducationEntry[];
  workExperience: WorkExperienceEntry[];
  /** Free-text application answers (expected salary, notice period, how heard, etc.)
   *  — included so a skill only mentioned there ("familiar with SAP") still counts. */
  answerText: string[];
}

export interface AtsResult {
  /** 0-100, or null when the requisition listed no required skills to score against
   *  (nothing to match means nothing to rank on — Application Review shows these
   *  candidates as "Not scored" rather than a misleading 0%). */
  score: number | null;
  matchedSkills: string[];
  missingSkills: string[];
}

/** Scores one candidate against a requisition's required-skill list. Pure
 *  function — no I/O — so it's cheap to call again if a candidate's fields
 *  or the requisition's required skills ever change and a rescore is
 *  wanted later. */
export function scoreCandidate(requiredSkills: string[], inputs: CandidateAtsInputs): AtsResult {
  const skills = requiredSkills.map((s) => s.trim()).filter(Boolean);
  if (skills.length === 0) {
    return { score: null, matchedSkills: [], missingSkills: [] };
  }

  const haystack = normalize(
    [
      inputs.skills.join(' '),
      inputs.resumeText ?? '',
      inputs.coverLetterText ?? '',
      ...inputs.education.map((e) => [e.degree, e.fieldOfStudy, e.school].filter(Boolean).join(' ')),
      ...inputs.workExperience.map((w) => [w.title, w.company, w.description].filter(Boolean).join(' ')),
      ...inputs.answerText,
    ].join(' \n '),
  );

  const matchedSkills: string[] = [];
  const missingSkills: string[] = [];
  for (const skill of skills) {
    // An explicit skill tag is always an exact-match win even if it wouldn't
    // pass the word-boundary check against itself (e.g. punctuation-heavy
    // tags like "C++" or "CI/CD").
    const explicit = inputs.skills.some((s) => normalize(s) === normalize(skill));
    if (explicit || haystackHasSkill(haystack, skill)) {
      matchedSkills.push(skill);
    } else {
      missingSkills.push(skill);
    }
  }

  const score = Math.round((matchedSkills.length / skills.length) * 100);
  return { score, matchedSkills, missingSkills };
}
