import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';

/** Global so any feature module can inject MailService without importing
 *  MailModule itself — mirrors how ConfigModule is wired in AppModule. */
@Global()
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
