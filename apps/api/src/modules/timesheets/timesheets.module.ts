import { Module } from '@nestjs/common';
import { TimesheetsService } from './timesheets.service';
import { TimesheetsController } from './timesheets.controller';

@Module({
  providers: [TimesheetsService],
  controllers: [TimesheetsController],
})
export class TimesheetsModule {}
