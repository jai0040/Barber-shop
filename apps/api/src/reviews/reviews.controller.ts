import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Auth, Authenticated, Perms, Public, RequirePermission } from '../common/decorators';
import { AuthContext, Effective } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ReviewsService } from './reviews.service';
import {
  createReviewSchema,
  replyReviewSchema,
  reviewsQuerySchema,
  updateReviewStatusSchema,
} from './reviews.schemas';

@Controller('reviews')
export class ReviewsController {
  constructor(private svc: ReviewsService) {}

  // --- Public Customer Website Endpoints ---

  @Public()
  @Get('public/:slug')
  listPublic(
    @Param('slug') slug: string,
    @Query(new ZodValidationPipe(reviewsQuerySchema)) q: any
  ) {
    return this.svc.listPublicReviews(slug, q);
  }

  @Public()
  @Get('public/:slug/summary')
  getPublicSummary(@Param('slug') slug: string) {
    return this.svc.getPublicReviewSummary(slug);
  }

  // --- Customer Authenticated Review Submission ---

  @Authenticated()
  @Post()
  createReview(
    @Auth() ctx: AuthContext,
    @Body(new ZodValidationPipe(createReviewSchema)) dto: any
  ) {
    return this.svc.createReview(ctx, dto);
  }

  // --- Staff & Shop Admin Management Endpoints ---

  @RequirePermission('reviews.view')
  @Get()
  listReviews(
    @Auth() ctx: AuthContext,
    @Perms() actor: Effective,
    @Query(new ZodValidationPipe(reviewsQuerySchema)) q: any
  ) {
    return this.svc.listReviews(ctx, actor, q);
  }

  @RequirePermission('reviews.manage')
  @Post(':id/reply')
  replyReview(
    @Auth() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(replyReviewSchema)) dto: any
  ) {
    return this.svc.replyReview(ctx, id, dto.ownerReply);
  }

  @RequirePermission('reviews.manage')
  @Patch(':id/status')
  updateStatus(
    @Auth() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateReviewStatusSchema)) dto: any
  ) {
    return this.svc.updateReviewStatus(ctx, id, dto.status);
  }
}
