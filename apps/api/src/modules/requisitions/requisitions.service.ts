import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, or, sql } from 'drizzle-orm';
import { withTenant } from '../../db/client';
import { candidates, employees, requisitions, users } from '../../db/schema';
import { resolveTenantBySlug } from '../../common/tenant/tenant.util';
import { MailService } from '../../common/mail/mail.service';
import { DOCUMENT_MIME_TYPES, assertMimeType, toDataUri } from '../../common/uploads/file.util';
import {
  extractPdfText,
  parseJsonArray,
  scoreCandidate,
  type EducationEntry,
  type WorkExperienceEntry,
} from '../../common/ats/ats.util';
import type { CreateRequisitionDto, UpdateRequisitionDto, ApplyDto } from './dto/requisition.dto';

/**
 * Skeleton per the framework doc: the requisition-approval object and the
 * candidate pipeline exist and persist, but the full posting/interview/offer
 * workflow (Sheet 03 of the framework) isn't built out yet — this is the
 * seam to extend for Phase 2.
 */
@Injectable()
export class RequisitionsService {
  constructor(private mail: MailService) {}

  findAll(tenantId: string) {
    return withTenant(tenantId, (tx) => tx.select().from(requisitions).where(eq(requisitions.tenantId, tenantId)));
  }

  // requestedById is nullable (see schema.ts) — an Admin account with no
  // linked employees row (created via the platform-admin "Add Tenant" flow)
  // can still raise a requisition; there's just no single "hiring manager"
  // employee to attribute or later notify (see apply()'s fallback).
  create(tenantId: string, requestedById: string | null, dto: CreateRequisitionDto) {
    return withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .insert(requisitions)
        .values({
          tenantId,
          requestedById,
          status: 'PENDING_APPROVAL',
          ...dto,
          targetStartDate: dto.targetStartDate ? new Date(dto.targetStartDate) : undefined,
        })
        .returning();
      return row;
    });
  }

  async approve(tenantId: string, id: string, approvedById: string | null) {
    const [row] = await withTenant(tenantId, (tx) =>
      tx
        .update(requisitions)
        // publishedAt marks the moment this became visible on the public
        // careers page (CareersService only ever selects status='APPROVED'
        // rows) — it's the "Date" shown there, and what the job list sorts by.
        .set({ status: 'APPROVED', approvedById, publishedAt: new Date() })
        .where(and(eq(requisitions.tenantId, tenantId), eq(requisitions.id, id)))
        .returning(),
    );
    if (!row) throw new NotFoundException('Requisition not found.');
    return row;
  }

  /** Edits a requisition's fields, including the public careers-page content — used before or after approval. */
  async update(tenantId: string, id: string, dto: UpdateRequisitionDto) {
    const [row] = await withTenant(tenantId, (tx) =>
      tx
        .update(requisitions)
        .set({ ...dto, targetStartDate: dto.targetStartDate !== undefined ? new Date(dto.targetStartDate) : undefined })
        .where(and(eq(requisitions.tenantId, tenantId), eq(requisitions.id, id)))
        .returning(),
    );
    if (!row) throw new NotFoundException('Requisition not found.');
    return row;
  }

  /** Ranked candidate list for Application Review — one requisition's
   *  applicant pool, ATS-highest first (nulls — no required skills to score
   *  against — sort last). Deliberately omits the dataUrl/rawText columns
   *  (could be several MB across many applicants); the CV/cover letter are
   *  fetched individually, on open, via getCandidateDocument below — same
   *  list/get split as EmployeeDocumentsService. */
  listCandidates(tenantId: string, requisitionId: string) {
    return withTenant(tenantId, (tx) =>
      tx
        .select({
          id: candidates.id,
          firstName: candidates.firstName,
          lastName: candidates.lastName,
          email: candidates.email,
          phone: candidates.phone,
          linkedinUrl: candidates.linkedinUrl,
          expectedSalary: candidates.expectedSalary,
          noticePeriod: candidates.noticePeriod,
          rightToWork: candidates.rightToWork,
          howHeard: candidates.howHeard,
          education: candidates.education,
          workExperience: candidates.workExperience,
          skills: candidates.skills,
          stage: candidates.stage,
          createdAt: candidates.createdAt,
          hasResume: sql<boolean>`${candidates.resumeDataUrl} is not null`,
          hasCoverLetter: sql<boolean>`${candidates.coverLetterDataUrl} is not null`,
          atsScore: candidates.atsScore,
          matchedSkills: candidates.matchedSkills,
          missingSkills: candidates.missingSkills,
        })
        .from(candidates)
        .where(and(eq(candidates.tenantId, tenantId), eq(candidates.requisitionId, requisitionId)))
        // Postgres sorts NULLs last by default on DESC — exactly the "not
        // scored" candidates falling to the bottom that Application Review wants.
        .orderBy(desc(candidates.atsScore)),
    );
  }

  /** One candidate's CV or cover letter, for the Application Review "view
   *  document" action — same DocumentFull shape (label/mimeType/dataUrl)
   *  the People profile's Documents tab already uses, so the frontend
   *  reuses the same viewer modal. */
  async getCandidateDocument(tenantId: string, requisitionId: string, candidateId: string, kind: 'resume' | 'coverLetter') {
    const [row] = await withTenant(tenantId, (tx) =>
      tx
        .select({
          firstName: candidates.firstName,
          lastName: candidates.lastName,
          fileName: kind === 'resume' ? candidates.resumeFileName : candidates.coverLetterFileName,
          mimeType: kind === 'resume' ? candidates.resumeMimeType : candidates.coverLetterMimeType,
          dataUrl: kind === 'resume' ? candidates.resumeDataUrl : candidates.coverLetterDataUrl,
        })
        .from(candidates)
        .where(
          and(
            eq(candidates.tenantId, tenantId),
            eq(candidates.requisitionId, requisitionId),
            eq(candidates.id, candidateId),
          ),
        )
        .limit(1),
    );
    if (!row || !row.dataUrl) {
      throw new NotFoundException(kind === 'resume' ? 'No CV on file for this candidate.' : 'No cover letter on file for this candidate.');
    }
    return {
      label: `${row.fileName ?? (kind === 'resume' ? 'CV' : 'Cover letter')} — ${row.firstName} ${row.lastName}`,
      mimeType: row.mimeType ?? 'application/pdf',
      dataUrl: row.dataUrl,
    };
  }

  /** Public apply endpoint — resolves the tenant by slug since the
   *  candidate isn't authenticated yet. `cv` is required (mime-checked
   *  before this runs — see the controller); `coverLetter` is optional.
   *  Both are capped at 2MB by the controller's FileFieldsInterceptor. */
  async apply(tenantSlug: string, requisitionId: string, dto: ApplyDto, cv: Express.Multer.File, coverLetter?: Express.Multer.File) {
    const tenant = await resolveTenantBySlug(tenantSlug);
    if (!tenant) throw new NotFoundException('Unknown organization.');

    assertMimeType(cv, DOCUMENT_MIME_TYPES, 'CV');
    if (coverLetter) assertMimeType(coverLetter, DOCUMENT_MIME_TYPES, 'cover letter');

    const skills = parseJsonArray<string>(dto.skills, 40)
      .map((s) => (typeof s === 'string' ? s.trim() : ''))
      .filter(Boolean);
    const education = parseJsonArray<EducationEntry>(dto.education, 20);
    const workExperience = parseJsonArray<WorkExperienceEntry>(dto.workExperience, 20);

    const [resumeText, coverLetterText] = await Promise.all([extractPdfText(cv), extractPdfText(coverLetter)]);

    const { candidate, requisition, notifyRecipients } = await withTenant(tenant.id, async (tx) => {
      const [requisition] = await tx
        .select()
        .from(requisitions)
        .where(and(eq(requisitions.tenantId, tenant.id), eq(requisitions.id, requisitionId)))
        .limit(1);
      if (!requisition) throw new NotFoundException('Requisition not found.');
      if (requisition.status !== 'APPROVED') throw new BadRequestException('This role is not open for applications.');

      const ats = scoreCandidate(requisition.requiredSkills, {
        skills,
        resumeText,
        coverLetterText,
        education,
        workExperience,
        answerText: [dto.expectedSalary, dto.noticePeriod, dto.linkedinUrl].filter((v): v is string => !!v),
      });

      const [candidate] = await tx
        .insert(candidates)
        .values({
          tenantId: tenant.id,
          requisitionId,
          firstName: dto.firstName,
          lastName: dto.lastName,
          email: dto.email,
          phone: dto.phone,
          linkedinUrl: dto.linkedinUrl,
          expectedSalary: dto.expectedSalary,
          noticePeriod: dto.noticePeriod,
          rightToWork: dto.rightToWork,
          howHeard: dto.howHeard,
          skills,
          education,
          workExperience,
          resumeFileName: cv.originalname,
          resumeMimeType: cv.mimetype,
          resumeDataUrl: toDataUri(cv),
          resumeText,
          ...(coverLetter
            ? {
                coverLetterFileName: coverLetter.originalname,
                coverLetterMimeType: coverLetter.mimetype,
                coverLetterDataUrl: toDataUri(coverLetter),
                coverLetterText,
              }
            : {}),
          atsScore: ats.score,
          matchedSkills: ats.matchedSkills,
          missingSkills: ats.missingSkills,
        })
        .returning();

      // The employee who raised the requisition — the natural owner to hear
      // about a new applicant, same as a leave request notifying the
      // employee's manager. requestedById is null when an Admin account
      // with no linked employees row raised it (see schema.ts) — there's no
      // single hiring manager to notify then, so notifyRecipients falls
      // back to every Admin/HR login on the tenant instead.
      const hiringManager = requisition.requestedById
        ? (
            await tx
              .select()
              .from(employees)
              .where(and(eq(employees.tenantId, tenant.id), eq(employees.id, requisition.requestedById)))
              .limit(1)
          )[0]
        : undefined;

      const notifyRecipients = hiringManager?.email
        ? [hiringManager.email]
        : (
            await tx
              .select({ email: users.email })
              .from(users)
              .where(and(eq(users.tenantId, tenant.id), or(eq(users.role, 'ADMIN'), eq(users.role, 'HR'))))
          )
            .map((u) => u.email)
            .filter((e): e is string => !!e);

      return { candidate, requisition, notifyRecipients };
    });

    if (notifyRecipients.length > 0) {
      const scoreLine =
        candidate.atsScore !== null
          ? `AI-ATS match: ${candidate.atsScore}% (${candidate.matchedSkills.length}/${candidate.matchedSkills.length + candidate.missingSkills.length} required skills).\n\n`
          : '';
      const text = `${dto.firstName} ${dto.lastName} (${dto.email}) applied for "${requisition.title}".\n\n${scoreLine}Sign in to tmPro to review the candidate pipeline under Recruitment → Application Review.`;
      await Promise.all(
        notifyRecipients.map((to) =>
          this.mail.send({ to, subject: `New application — ${requisition.title}`, text }),
        ),
      );
    }

    return candidate;
  }
}
