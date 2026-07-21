import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from './prisma.service';
import { Public } from './access-control/access.decorators';

@ApiTags('system')
@Controller()
@Public()
export class HealthController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get('health')
  @ApiOperation({ summary: 'Liveness check' })
  @ApiResponse({ status: 200, description: 'API process is healthy' })
  health() {
    return { status: 'ok', service: 'api' };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Database readiness check' })
  @ApiResponse({ status: 200, description: 'API and database are ready' })
  @ApiResponse({ status: 503, description: 'Database is unavailable' })
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', database: 'connected' };
    } catch {
      throw new ServiceUnavailableException('Database is unavailable');
    }
  }
}
