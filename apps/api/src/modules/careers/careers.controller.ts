import { Controller, Get, Param } from '@nestjs/common';
import { CareersService } from './careers.service';

/** Public — powers /careers/[tenantSlug] and its job-detail page. No auth. */
@Controller('careers')
export class CareersController {
  constructor(private careers: CareersService) {}

  @Get(':slug')
  getOrganization(@Param('slug') slug: string) {
    return this.careers.getOrganization(slug);
  }

  @Get(':slug/jobs')
  listJobs(@Param('slug') slug: string) {
    return this.careers.listJobs(slug);
  }

  @Get(':slug/jobs/:jobId')
  getJob(@Param('slug') slug: string, @Param('jobId') jobId: string) {
    return this.careers.getJob(slug, jobId);
  }
}
