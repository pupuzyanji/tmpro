import { Module } from '@nestjs/common';
import { PlatformAdminModule } from '../../platform-admin/platform-admin.module';
import { BillingController, BillingPublicController } from './billing.controller';
import { BillingService } from './billing.service';

@Module({
  imports: [PlatformAdminModule],
  controllers: [BillingPublicController, BillingController],
  providers: [BillingService],
})
export class BillingModule {}
