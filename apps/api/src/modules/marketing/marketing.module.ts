import { Module } from '@nestjs/common';
import { PlatformAdminModule } from '../../platform-admin/platform-admin.module';
import { MarketingAdminController, MarketingController } from './marketing.controller';
import { MarketingService } from './marketing.service';

@Module({
  imports: [PlatformAdminModule],
  controllers: [MarketingController, MarketingAdminController],
  providers: [MarketingService],
})
export class MarketingModule {}
