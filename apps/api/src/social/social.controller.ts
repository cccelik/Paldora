import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import type { AuthenticatedPrincipal } from '@paldora/domain';
import {
  createBlockSchema,
  createFriendRequestSchema,
  cursorPageQuerySchema,
} from '@paldora/validation';
import type { z } from 'zod';
import { CurrentPrincipal } from '../platform/auth/current-principal.decorator.js';
import {
  RateLimit,
  RateLimitExempt,
} from '../platform/rate-limit/rate-limit.decorator.js';
import { uuidParam } from '../platform/uuid-param.js';
import { ZodPipe } from '../platform/zod.pipe.js';
import { BlockService } from './block.service.js';
import { FriendshipService } from './friendship.service.js';

type Principal = AuthenticatedPrincipal;
type PageQuery = z.output<typeof cursorPageQuerySchema>;
const pageQuery = new ZodPipe(cursorPageQuerySchema);
const hour = 3_600;

@Controller()
export class FriendshipController {
  public constructor(
    @Inject(FriendshipService) private readonly friendships: FriendshipService,
  ) {}

  @Get('friends')
  public friends(
    @CurrentPrincipal() me: Principal,
    @Query(pageQuery) query: PageQuery,
  ) {
    return this.friendships.friends(me.userId, query);
  }

  @Get('friend-requests')
  public requests(
    @CurrentPrincipal() me: Principal,
    @Query(pageQuery) query: PageQuery,
  ) {
    return this.friendships.requests(me.userId, query);
  }

  @Post('friend-requests')
  @RateLimit({ scope: 'friend-request', limit: 20, windowSeconds: hour })
  public request(
    @CurrentPrincipal() me: Principal,
    @Body(new ZodPipe(createFriendRequestSchema))
    body: z.output<typeof createFriendRequestSchema>,
  ) {
    return this.friendships.request(me.userId, body.username);
  }

  @Post('friend-requests/:friendshipId/accept')
  @HttpCode(HttpStatus.OK)
  @RateLimitExempt('Bounded by the requests the person has received.')
  public accept(
    @CurrentPrincipal() me: Principal,
    @Param('friendshipId', uuidParam) friendshipId: string,
  ) {
    return this.friendships.accept(me.userId, friendshipId);
  }

  @Post('friend-requests/:friendshipId/decline')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimitExempt('Bounded by the requests the person has received.')
  public async decline(
    @CurrentPrincipal() me: Principal,
    @Param('friendshipId', uuidParam) friendshipId: string,
  ): Promise<void> {
    await this.friendships.decline(me.userId, friendshipId);
  }

  @Delete('friend-requests/:friendshipId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimitExempt(
    'Bounded by the requests the person has sent (rate-limited).',
  )
  public async cancel(
    @CurrentPrincipal() me: Principal,
    @Param('friendshipId', uuidParam) friendshipId: string,
  ): Promise<void> {
    await this.friendships.cancel(me.userId, friendshipId);
  }

  @Delete('friends/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimitExempt('Bounded by the friendships the person has.')
  public async remove(
    @CurrentPrincipal() me: Principal,
    @Param('userId', uuidParam) userId: string,
  ): Promise<void> {
    await this.friendships.remove(me.userId, userId);
  }
}

@Controller('blocks')
export class BlockController {
  public constructor(
    @Inject(BlockService) private readonly blocks: BlockService,
  ) {}

  @Get()
  public list(
    @CurrentPrincipal() me: Principal,
    @Query(pageQuery) query: PageQuery,
  ) {
    return this.blocks.list(me.userId, query);
  }

  @Post()
  @RateLimit({ scope: 'block-create', limit: 60, windowSeconds: hour })
  public create(
    @CurrentPrincipal() me: Principal,
    @Body(new ZodPipe(createBlockSchema))
    body: z.output<typeof createBlockSchema>,
  ) {
    return this.blocks.create(me.userId, body.username);
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimitExempt('Idempotent removal of the person’s own block.')
  public async remove(
    @CurrentPrincipal() me: Principal,
    @Param('userId', uuidParam) userId: string,
  ): Promise<void> {
    await this.blocks.remove(me.userId, userId);
  }
}
