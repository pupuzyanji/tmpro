import { Module } from '@nestjs/common';
import { OrgSignupService } from './org-signup.service';
import { OrgSignupController } from './org-signup.controller';

@Module({
  providers: [OrgSignupService],
  controllers: [OrgSignupController],
})
export class OrgSignupModule {}
