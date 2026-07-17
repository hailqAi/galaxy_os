import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { PermissionsController } from './permissions.controller';

@Module({ controllers: [PermissionsController], providers: [PrismaService] })
export class PermissionsModule {}
