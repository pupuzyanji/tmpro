import { Module } from '@nestjs/common';
import { LeaveService } from './leave.service';
import { LeaveController } from './leave.controller';

@Module({
  providers: [LeaveService],
  exports: [LeaveService],
  controllers: [LeaveController],
})
export class LeaveModule {}
