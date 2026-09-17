import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IMAGE_MIME_TYPES, assertMimeType, toDataUri } from '../../common/uploads/file.util';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ModuleGuard } from '../../common/guards/module.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequiresModule } from '../../common/decorators/requires-module.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { TrainingService } from './training.service';
import { AssignCourseDto, CreateCourseDto, SetQuizDto, SubmitQuizDto, UpdateCourseDto } from './dto/training.dto';

/** Course authoring — Settings > Training, Admin-only (mirrors
 *  SettingsController's shape/guards, kept as its own module since Training
 *  is its own domain with its own employee-facing side below). */
@Controller('settings/training/courses')
@UseGuards(JwtAuthGuard, RolesGuard, ModuleGuard)
@Roles('ADMIN', 'HR')
@RequiresModule('Training & LMS')
export class TrainingAdminController {
  constructor(private training: TrainingService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.training.listCourses(user.tenantId);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCourseDto) {
    return this.training.createCourse(user.tenantId, user.employeeId, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateCourseDto) {
    return this.training.updateCourse(user.tenantId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.training.deleteCourse(user.tenantId, id);
  }

  @Post(':id/image')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 3 * 1024 * 1024 } }))
  uploadImage(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    assertMimeType(file, IMAGE_MIME_TYPES, 'course image');
    return this.training.updateCourse(user.tenantId, id, { imageUrl: toDataUri(file) });
  }

  @Post(':id/publish')
  publish(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.training.setPublished(user.tenantId, id, true);
  }

  @Post(':id/unpublish')
  unpublish(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.training.setPublished(user.tenantId, id, false);
  }

  @Patch(':id/quiz')
  setQuiz(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: SetQuizDto) {
    return this.training.setQuiz(user.tenantId, id, dto);
  }
}

/** The Training sidebar page: My Courses (every signed-in role with an
 *  employee profile) and, below it, Assign Courses (Supervisor + Admin). */
@Controller('training')
@UseGuards(JwtAuthGuard, RolesGuard, ModuleGuard)
@RequiresModule('Training & LMS')
export class TrainingController {
  constructor(private training: TrainingService) {}

  @Get('published')
  @Roles('ADMIN', 'SUPERVISOR', 'HR')
  listPublished(@CurrentUser() user: AuthenticatedUser) {
    return this.training.listPublished(user.tenantId);
  }

  @Post('assignments')
  @Roles('ADMIN', 'SUPERVISOR', 'HR')
  assign(@CurrentUser() user: AuthenticatedUser, @Body() dto: AssignCourseDto) {
    return this.training.assign(user.tenantId, user, dto);
  }

  @Get('courses/:courseId/assignees')
  @Roles('ADMIN', 'SUPERVISOR', 'HR')
  assignees(@CurrentUser() user: AuthenticatedUser, @Param('courseId') courseId: string) {
    return this.training.courseAssignees(user.tenantId, user, courseId);
  }

  @Get('my-courses')
  @Roles('ADMIN', 'SUPERVISOR', 'EMPLOYEE', 'HR')
  myCourses(@CurrentUser() user: AuthenticatedUser) {
    if (!user.employeeId) return [];
    return this.training.myCourses(user.tenantId, user.employeeId);
  }

  @Post('assignments/:id/start')
  @Roles('ADMIN', 'SUPERVISOR', 'EMPLOYEE', 'HR')
  start(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    if (!user.employeeId) throw new NotFoundException('No employee profile on this account.');
    return this.training.start(user.tenantId, user.employeeId, id);
  }

  @Post('assignments/:id/complete')
  @Roles('ADMIN', 'SUPERVISOR', 'EMPLOYEE', 'HR')
  complete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    if (!user.employeeId) throw new NotFoundException('No employee profile on this account.');
    return this.training.complete(user.tenantId, user.employeeId, id);
  }

  @Get('assignments/:id/quiz')
  @Roles('ADMIN', 'SUPERVISOR', 'EMPLOYEE', 'HR')
  quiz(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    if (!user.employeeId) throw new NotFoundException('No employee profile on this account.');
    return this.training.assignmentQuiz(user.tenantId, user.employeeId, id);
  }

  @Post('assignments/:id/submit-quiz')
  @Roles('ADMIN', 'SUPERVISOR', 'EMPLOYEE', 'HR')
  submitQuiz(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: SubmitQuizDto) {
    if (!user.employeeId) throw new NotFoundException('No employee profile on this account.');
    return this.training.submitQuiz(user.tenantId, user.employeeId, id, dto);
  }
}
