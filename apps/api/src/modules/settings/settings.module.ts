import { Module } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { AnnouncementsFeedController, OrganizationBrandingController, SettingsController } from './settings.controller';

@Module({
  providers: [SettingsService],
  controllers: [SettingsController, AnnouncementsFeedController, OrganizationBrandingController],
})
export class SettingsModule {}
