import { Module } from '@nestjs/common';
import { PayrollService } from './payroll.service';
import { PayrollController } from './payroll.controller';
import { PayRunWorkflowService } from './pay-run-workflow.service';

@Module({
  providers: [PayrollService, PayRunWorkflowService],
  controllers: [PayrollController],
})
export class PayrollModule {}
