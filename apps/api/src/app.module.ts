import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Controller, Get } from '@nestjs/common';
import { MailModule } from './common/mail/mail.module';
import { AuthModule } from './auth/auth.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { LeaveModule } from './modules/leave/leave.module';
import { TimesheetsModule } from './modules/timesheets/timesheets.module';
import { RequisitionsModule } from './modules/requisitions/requisitions.module';
import { PerformanceModule } from './modules/performance/performance.module';
import { PayrollModule } from './modules/payroll/payroll.module';
import { SettingsModule } from './modules/settings/settings.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { ReportsModule } from './modules/reports/reports.module';
import { TrainingModule } from './modules/training/training.module';
import { CareersModule } from './modules/careers/careers.module';
import { OrgSignupModule } from './modules/org-signup/org-signup.module';
import { PlatformAdminModule } from './platform-admin/platform-admin.module';
import { BillingModule } from './modules/billing/billing.module';
import { DataExportModule } from './modules/data-export/data-export.module';

@Controller()
class HealthController {
  @Get('health')
  health() {
    return { status: 'ok', service: 'tmpro-api' };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MailModule,
    AuthModule,
    EmployeesModule,
    LeaveModule,
    TimesheetsModule,
    RequisitionsModule,
    PerformanceModule,
    PayrollModule,
    SettingsModule,
    DashboardModule,
    ReportsModule,
    TrainingModule,
    CareersModule,
    OrgSignupModule,
    PlatformAdminModule,
    BillingModule,
    DataExportModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
