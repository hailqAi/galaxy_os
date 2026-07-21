import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaService } from '../prisma.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailService } from './email.service';
import { AccessControlModule } from '../access-control/access-control.module';

@Module({
  imports: [AuditModule, AccessControlModule],
  controllers: [AuthController],
  providers: [AuthService, EmailService, PrismaService],
  exports: [AuthService],
})
export class AuthModule {}
