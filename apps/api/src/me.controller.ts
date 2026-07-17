import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Actor } from './access-control/access.decorators';
import { CurrentActor } from './access-control/current-actor';

@ApiTags('current context')
@Controller('me')
export class MeController {
  @Get()
  @ApiOperation({ summary: 'Get the current actor' })
  me(@Actor() actor: CurrentActor) {
    return actor;
  }

  @Get('permissions')
  @ApiOperation({ summary: 'Get effective permissions' })
  permissions(@Actor() actor: CurrentActor) {
    return { permissions: actor.permissions };
  }
}
