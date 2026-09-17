import { Module } from '@nestjs/common';
import { RequisitionsService } from './requisitions.service';
import { RequisitionsController } from './requisitions.controller';

@Module({
  providers: [RequisitionsService],
  controllers: [RequisitionsController],
})
export class RequisitionsModule {}
