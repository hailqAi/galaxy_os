import { Controller, Get, Inject, Query } from '@nestjs/common';
import { Actor, RequirePermission } from '../access-control/access.decorators';
import { CurrentActor } from '../access-control/current-actor';
import { SearchService } from './search.service';
import { SearchQuery } from './search.dto';
@Controller('search')
export class SearchController {
  constructor(@Inject(SearchService) private readonly service: SearchService) {}
  @Get() @RequirePermission('search.read') search(
    @Actor() actor: CurrentActor,
    @Query() query: SearchQuery,
  ) {
    return this.service.search(actor, query);
  }
}
