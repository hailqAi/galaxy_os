import {
  Controller,
  Get,
  Inject,
  Header,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from './prisma.service';
import { Public } from './access-control/access.decorators';
import { RuntimeRequest, runtimeIdentity } from './runtime-http';

@ApiTags('system')
@Controller()
@Public()
export class HealthController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get('health')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Liveness check' })
  @ApiResponse({ status: 200, description: 'API process is healthy' })
  health(@Req() request?: RuntimeRequest) {
    return {
      status: 'ok',
      service: 'api',
      ...(request?.runtimeIdentity ?? runtimeIdentity()),
    };
  }

  @Get('ready')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Database readiness check' })
  @ApiResponse({ status: 200, description: 'API and database are ready' })
  @ApiResponse({ status: 503, description: 'Database is unavailable' })
  async ready(@Req() request?: RuntimeRequest) {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'ok',
        database: 'connected',
        ...(request?.runtimeIdentity ?? runtimeIdentity()),
      };
    } catch {
      throw new ServiceUnavailableException('Database is unavailable');
    }
  }
}
