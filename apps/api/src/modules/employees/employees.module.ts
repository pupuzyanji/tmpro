import { Module } from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { EmployeesController } from './employees.controller';
import { EmployeeDetailsService } from './employee-details.service';
import { EmployeeDetailsController } from './employee-details.controller';
import { EmployeeHistoryService } from './employee-history.service';
import { EmployeeHistoryController } from './employee-history.controller';
import { EmployeePerformanceService } from './employee-performance.service';
import { EmployeePerformanceController } from './employee-performance.controller';
import { EmployeeDocumentsService } from './employee-documents.service';
import { EmployeeDocumentsController } from './employee-documents.controller';
import { DocumentsController } from './documents.controller';

@Module({
  providers: [
    EmployeesService,
    EmployeeDetailsService,
    EmployeeHistoryService,
    EmployeePerformanceService,
    EmployeeDocumentsService,
  ],
  controllers: [
    EmployeesController,
    EmployeeDetailsController,
    EmployeeHistoryController,
    EmployeePerformanceController,
    EmployeeDocumentsController,
    DocumentsController,
  ],
  exports: [EmployeesService],
})
export class EmployeesModule {}
