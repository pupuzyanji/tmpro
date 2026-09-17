import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { withTenant } from '../../db/client';
import { courseAssignments, courseQuizOptions, courseQuizQuestions, courses, employees } from '../../db/schema';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import type { AssignCourseDto, CreateCourseDto, SetQuizDto, SubmitQuizDto, UpdateCourseDto } from './dto/training.dto';

@Injectable()
export class TrainingService {
  // --- Admin: course authoring (Settings > Training) -----------------------

  listCourses(tenantId: string) {
    return withTenant(tenantId, (tx) =>
      tx.query.courses.findMany({
        where: eq(courses.tenantId, tenantId),
        with: { quizQuestions: { with: { options: true } } },
        orderBy: (c, { desc }) => desc(c.createdAt),
      }),
    );
  }

  async createCourse(tenantId: string, createdById: string | null, dto: CreateCourseDto) {
    return withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .insert(courses)
        .values({ tenantId, title: dto.title, imageUrl: dto.imageUrl, courseUrl: dto.courseUrl, createdById })
        .returning();
      return row;
    });
  }

  async updateCourse(tenantId: string, id: string, dto: UpdateCourseDto) {
    return withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .update(courses)
        .set({ ...dto, updatedAt: new Date() })
        .where(and(eq(courses.tenantId, tenantId), eq(courses.id, id)))
        .returning();
      if (!row) throw new NotFoundException('Course not found.');
      return row;
    });
  }

  async deleteCourse(tenantId: string, id: string) {
    return withTenant(tenantId, async (tx) => {
      const questionIds = (
        await tx.select({ id: courseQuizQuestions.id }).from(courseQuizQuestions).where(and(eq(courseQuizQuestions.tenantId, tenantId), eq(courseQuizQuestions.courseId, id)))
      ).map((q) => q.id);
      if (questionIds.length > 0) {
        await tx.delete(courseQuizOptions).where(inArray(courseQuizOptions.questionId, questionIds));
        await tx.delete(courseQuizQuestions).where(and(eq(courseQuizQuestions.tenantId, tenantId), eq(courseQuizQuestions.courseId, id)));
      }
      await tx.delete(courseAssignments).where(and(eq(courseAssignments.tenantId, tenantId), eq(courseAssignments.courseId, id)));
      const [row] = await tx.delete(courses).where(and(eq(courses.tenantId, tenantId), eq(courses.id, id))).returning();
      if (!row) throw new NotFoundException('Course not found.');
      return { ok: true };
    });
  }

  async setPublished(tenantId: string, id: string, published: boolean) {
    return withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .update(courses)
        .set({ published, updatedAt: new Date() })
        .where(and(eq(courses.tenantId, tenantId), eq(courses.id, id)))
        .returning();
      if (!row) throw new NotFoundException('Course not found.');
      return row;
    });
  }

  /** Full replace of a course's MCQ quiz — each question must carry exactly
   *  one option with isCorrect: true. */
  async setQuiz(tenantId: string, courseId: string, dto: SetQuizDto) {
    for (const q of dto.questions) {
      const correctCount = q.options.filter((o) => o.isCorrect).length;
      if (correctCount !== 1) {
        throw new BadRequestException(`Question "${q.question}" must have exactly one correct option.`);
      }
    }
    return withTenant(tenantId, async (tx) => {
      const [course] = await tx.select().from(courses).where(and(eq(courses.tenantId, tenantId), eq(courses.id, courseId))).limit(1);
      if (!course) throw new NotFoundException('Course not found.');

      const existingQuestionIds = (
        await tx.select({ id: courseQuizQuestions.id }).from(courseQuizQuestions).where(and(eq(courseQuizQuestions.tenantId, tenantId), eq(courseQuizQuestions.courseId, courseId)))
      ).map((q) => q.id);
      if (existingQuestionIds.length > 0) {
        await tx.delete(courseQuizOptions).where(inArray(courseQuizOptions.questionId, existingQuestionIds));
        await tx.delete(courseQuizQuestions).where(and(eq(courseQuizQuestions.tenantId, tenantId), eq(courseQuizQuestions.courseId, courseId)));
      }

      for (let qi = 0; qi < dto.questions.length; qi++) {
        const q = dto.questions[qi];
        const [questionRow] = await tx
          .insert(courseQuizQuestions)
          .values({ tenantId, courseId, question: q.question, sortOrder: qi })
          .returning();
        for (let oi = 0; oi < q.options.length; oi++) {
          const o = q.options[oi];
          await tx.insert(courseQuizOptions).values({
            tenantId,
            questionId: questionRow.id,
            optionText: o.optionText,
            isCorrect: o.isCorrect,
            sortOrder: oi,
          });
        }
      }

      return tx.query.courses.findFirst({
        where: and(eq(courses.tenantId, tenantId), eq(courses.id, courseId)),
        with: { quizQuestions: { with: { options: true } } },
      });
    });
  }

  // --- Published courses + assignment (Supervisor/Admin) -------------------

  listPublished(tenantId: string) {
    return withTenant(tenantId, (tx) =>
      tx.select().from(courses).where(and(eq(courses.tenantId, tenantId), eq(courses.published, true))).orderBy(courses.title),
    );
  }

  /** Assign one published course to a set of employees. A Supervisor may
   *  only assign to their own direct reports (+ themselves); Admin may
   *  assign to anyone in the tenant. Already-assigned employees are quietly
   *  skipped rather than erroring, so re-running "Assign" over an overlapping
   *  selection is safe. */
  async assign(tenantId: string, assigner: AuthenticatedUser, dto: AssignCourseDto) {
    return withTenant(tenantId, async (tx) => {
      const [course] = await tx.select().from(courses).where(and(eq(courses.tenantId, tenantId), eq(courses.id, dto.courseId))).limit(1);
      if (!course) throw new NotFoundException('Course not found.');
      if (!course.published) throw new BadRequestException('Only published courses can be assigned.');

      let allowedEmployeeIds = new Set(dto.employeeIds);
      if (assigner.role === 'SUPERVISOR') {
        const reports = await tx
          .select({ id: employees.id })
          .from(employees)
          .where(and(eq(employees.tenantId, tenantId), eq(employees.managerId, assigner.employeeId as string)));
        const allowed = new Set([...reports.map((r) => r.id), assigner.employeeId].filter(Boolean) as string[]);
        allowedEmployeeIds = new Set(dto.employeeIds.filter((id) => allowed.has(id)));
      }
      if (allowedEmployeeIds.size === 0) {
        throw new ForbiddenException('You can only assign courses to your own direct reports.');
      }

      const existing = await tx
        .select({ employeeId: courseAssignments.employeeId })
        .from(courseAssignments)
        .where(and(eq(courseAssignments.tenantId, tenantId), eq(courseAssignments.courseId, dto.courseId)));
      const alreadyAssigned = new Set(existing.map((e) => e.employeeId));

      const toInsert = [...allowedEmployeeIds].filter((id) => !alreadyAssigned.has(id));
      const created = [];
      for (const employeeId of toInsert) {
        const [row] = await tx
          .insert(courseAssignments)
          .values({ tenantId, courseId: dto.courseId, employeeId, assignedById: assigner.employeeId })
          .returning();
        created.push(row);
      }
      return { assigned: created.length, skipped: allowedEmployeeIds.size - created.length };
    });
  }

  /** Assignees for one course, scoped the same way `assign()` is — a
   *  Supervisor only sees their own reports' assignments on it. */
  async courseAssignees(tenantId: string, viewer: AuthenticatedUser, courseId: string) {
    return withTenant(tenantId, async (tx) => {
      let rows = await tx.query.courseAssignments.findMany({
        where: and(eq(courseAssignments.tenantId, tenantId), eq(courseAssignments.courseId, courseId)),
        with: { employee: true },
        orderBy: (a, { desc }) => desc(a.assignedAt),
      });
      if (viewer.role === 'SUPERVISOR') {
        rows = rows.filter((r) => r.employee?.managerId === viewer.employeeId || r.employeeId === viewer.employeeId);
      }
      return rows;
    });
  }

  // --- Employee-facing: My Courses ------------------------------------------

  myCourses(tenantId: string, employeeId: string) {
    return withTenant(tenantId, (tx) =>
      tx.query.courseAssignments.findMany({
        where: and(eq(courseAssignments.tenantId, tenantId), eq(courseAssignments.employeeId, employeeId)),
        with: { course: { with: { quizQuestions: true } } },
        orderBy: (a, { desc }) => desc(a.assignedAt),
      }),
    );
  }

  async start(tenantId: string, employeeId: string, assignmentId: string) {
    return withTenant(tenantId, async (tx) => {
      const [assignment] = await tx
        .select()
        .from(courseAssignments)
        .where(and(eq(courseAssignments.tenantId, tenantId), eq(courseAssignments.id, assignmentId)))
        .limit(1);
      if (!assignment || assignment.employeeId !== employeeId) throw new NotFoundException('Assignment not found.');
      if (assignment.status !== 'PENDING') return assignment;
      const [row] = await tx
        .update(courseAssignments)
        .set({ status: 'STARTED', startedAt: new Date() })
        .where(eq(courseAssignments.id, assignmentId))
        .returning();
      return row;
    });
  }

  /** Marks an assignment complete directly — for a course with no quiz,
   *  where there's nothing to grade. */
  async complete(tenantId: string, employeeId: string, assignmentId: string) {
    return withTenant(tenantId, async (tx) => {
      const [assignment] = await tx
        .select()
        .from(courseAssignments)
        .where(and(eq(courseAssignments.tenantId, tenantId), eq(courseAssignments.id, assignmentId)))
        .limit(1);
      if (!assignment || assignment.employeeId !== employeeId) throw new NotFoundException('Assignment not found.');
      const [row] = await tx
        .update(courseAssignments)
        .set({ status: 'COMPLETED', completedAt: new Date(), startedAt: assignment.startedAt ?? new Date() })
        .where(eq(courseAssignments.id, assignmentId))
        .returning();
      return row;
    });
  }

  /** The quiz for one of the employee's own assignments — options with
   *  `isCorrect` stripped, since this is served to whoever is about to take
   *  the quiz, not whoever authored it. */
  async assignmentQuiz(tenantId: string, employeeId: string, assignmentId: string) {
    return withTenant(tenantId, async (tx) => {
      const [assignment] = await tx
        .select()
        .from(courseAssignments)
        .where(and(eq(courseAssignments.tenantId, tenantId), eq(courseAssignments.id, assignmentId)))
        .limit(1);
      if (!assignment || assignment.employeeId !== employeeId) throw new NotFoundException('Assignment not found.');

      const questions = await tx.query.courseQuizQuestions.findMany({
        where: and(eq(courseQuizQuestions.tenantId, tenantId), eq(courseQuizQuestions.courseId, assignment.courseId)),
        with: { options: true },
        orderBy: (q, { asc }) => asc(q.sortOrder),
      });
      return questions.map((q) => ({
        id: q.id,
        question: q.question,
        options: q.options
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((o) => ({ id: o.id, optionText: o.optionText })),
      }));
    });
  }

  async submitQuiz(tenantId: string, employeeId: string, assignmentId: string, dto: SubmitQuizDto) {
    return withTenant(tenantId, async (tx) => {
      const [assignment] = await tx
        .select()
        .from(courseAssignments)
        .where(and(eq(courseAssignments.tenantId, tenantId), eq(courseAssignments.id, assignmentId)))
        .limit(1);
      if (!assignment || assignment.employeeId !== employeeId) throw new NotFoundException('Assignment not found.');

      const questions = await tx.query.courseQuizQuestions.findMany({
        where: and(eq(courseQuizQuestions.tenantId, tenantId), eq(courseQuizQuestions.courseId, assignment.courseId)),
        with: { options: true },
      });
      if (questions.length === 0) throw new BadRequestException('This course has no quiz to submit.');

      const answerByQuestion = new Map(dto.answers.map((a) => [a.questionId, a.optionId]));
      let correct = 0;
      for (const q of questions) {
        const chosenOptionId = answerByQuestion.get(q.id);
        const correctOption = q.options.find((o) => o.isCorrect);
        if (chosenOptionId && correctOption && chosenOptionId === correctOption.id) correct += 1;
      }
      const scorePercent = Math.round((correct / questions.length) * 100);

      const [row] = await tx
        .update(courseAssignments)
        .set({
          status: 'COMPLETED',
          scorePercent,
          completedAt: new Date(),
          startedAt: assignment.startedAt ?? new Date(),
        })
        .where(eq(courseAssignments.id, assignmentId))
        .returning();
      return row;
    });
  }
}
