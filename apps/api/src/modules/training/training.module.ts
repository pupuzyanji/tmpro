import { Module } from '@nestjs/common';
import { TrainingService } from './training.service';
import { TrainingAdminController, TrainingController } from './training.controller';

@Module({
  providers: [TrainingService],
  controllers: [TrainingAdminController, TrainingController],
})
export class TrainingModule {}
