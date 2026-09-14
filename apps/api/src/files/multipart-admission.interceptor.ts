import {
  CallHandler,
  ExecutionContext,
  Injectable,
  HttpException,
  HttpStatus,
  NestInterceptor,
  UnauthorizedException,
} from '@nestjs/common';
import { finalize } from 'rxjs';
import { CurrentActor } from '../access-control/current-actor';

const maximumConcurrentMultipartUploads = 8;
const maximumActorMultipartUploads = 2;

@Injectable()
export class MultipartAdmissionInterceptor implements NestInterceptor {
  private active = 0;
  private readonly activeByActor = new Map<string, number>();

  intercept(context: ExecutionContext, next: CallHandler) {
    const actor = context
      .switchToHttp()
      .getRequest<{ actor?: CurrentActor }>().actor;
    if (!actor) throw new UnauthorizedException('Authentication required');
    const actorActive = this.activeByActor.get(actor.userId) ?? 0;
    if (
      this.active >= maximumConcurrentMultipartUploads ||
      actorActive >= maximumActorMultipartUploads
    )
      throw new HttpException(
        'Too many concurrent multipart uploads',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    this.active += 1;
    this.activeByActor.set(actor.userId, actorActive + 1);
    const release = () => {
      this.active -= 1;
      const remaining = (this.activeByActor.get(actor.userId) ?? 1) - 1;
      if (remaining) this.activeByActor.set(actor.userId, remaining);
      else this.activeByActor.delete(actor.userId);
    };
    try {
      return next.handle().pipe(finalize(release));
    } catch (error) {
      release();
      throw error;
    }
  }
}
