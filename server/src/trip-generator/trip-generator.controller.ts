import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import archiver from 'archiver';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { GenerateTripPlanDto } from './dto/generate-trip-plan.dto';
import {
  BackfillListingImagesResultDto,
  CreateListingFromPlanResultDto,
  SyncListingImagesResultDto,
  GenerateTripPlanResultDto,
} from './dto/generated-plan.dto';
import { TripGeneratorService } from './trip-generator.service';

// Available to any authenticated dashboard user (the global JwtAuthGuard
// enforces auth; there is no @Public here). Not admin-gated.
@ApiTags('Trip Generator')
@ApiBearerAuth()
@Controller('trip-generator')
export class TripGeneratorController {
  constructor(private readonly tripGenerator: TripGeneratorService) {}

  @Post('generate')
  @ApiOperation({
    operationId: 'generateTripPlan',
    summary:
      'Generate a trip plan with Gemini (takes 1-3 minutes). The returned id drives the CSV / images / create-listing endpoints and lives in memory for 2 hours.',
  })
  @ApiCreatedResponse({ type: GenerateTripPlanResultDto })
  generate(
    @Body() dto: GenerateTripPlanDto,
  ): Promise<GenerateTripPlanResultDto> {
    return this.tripGenerator.generate(dto);
  }

  @Get('plans/:id/csv')
  @ApiOperation({
    operationId: 'downloadTripPlanCsv',
    summary: 'Download the generated plan as a OnePlan-template CSV.',
  })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiProduces('text/csv')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  @ApiNotFoundResponse({ description: 'Plan expired or not found' })
  downloadCsv(@Param('id') id: string, @Res() reply: FastifyReply): void {
    const { filename, csv } = this.tripGenerator.buildCsv(id);
    reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      )
      // BOM so Excel opens Vietnamese text correctly
      .send('﻿' + csv);
  }

  @Get('plans/:id/images')
  @ApiOperation({
    operationId: 'downloadTripPlanImages',
    summary:
      'Download a ZIP of place images (one folder per place, up to 5 images each). Can take a few minutes.',
  })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiProduces('application/zip')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  @ApiNotFoundResponse({ description: 'Plan expired or not found' })
  async downloadImages(
    @Param('id') id: string,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const { filename, folders } =
      await this.tripGenerator.collectPlanImages(id);

    const archive = archiver('zip', { zlib: { level: 6 } });
    for (const f of folders) {
      for (const img of f.images) {
        archive.append(img.buffer, { name: `${f.folder}/${img.name}` });
      }
    }
    reply
      .header('Content-Type', 'application/zip')
      .header(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      )
      .send(archive);
    await archive.finalize();
  }

  @Post('plans/:id/create-listing')
  @ApiOperation({
    operationId: 'createListingFromPlan',
    summary:
      'Create a real marketplace listing (with plan items and images) from the generated plan. The current user becomes the listing owner. Can take a few minutes while images are scraped and uploaded.',
  })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiCreatedResponse({ type: CreateListingFromPlanResultDto })
  @ApiNotFoundResponse({ description: 'Plan expired or not found' })
  createListing(
    @Param('id') id: string,
    @CurrentUser('sub') userId: number,
  ): Promise<CreateListingFromPlanResultDto> {
    return this.tripGenerator.createListing(id, userId);
  }

  @Post('listings/:listingId/backfill-images')
  @ApiOperation({
    operationId: 'backfillListingImages',
    summary:
      'Search and attach photos for the items of an existing listing (owned by the current user) that have fewer than `minImages` photos. Use after a create-listing run that came back with too few images. Can take a few minutes.',
  })
  @ApiParam({ name: 'listingId', type: 'integer' })
  @ApiQuery({
    name: 'minImages',
    required: false,
    type: 'integer',
    description: 'Items with fewer photos than this are refilled (default 1)',
  })
  @ApiQuery({
    name: 'dedupe',
    required: false,
    type: 'boolean',
    description:
      'Also drop byte-identical duplicate photos within an item before refilling (default false)',
  })
  @ApiQuery({
    name: 'recheck',
    required: false,
    type: 'boolean',
    description:
      'Re-run the vision review on photos already attached and drop the ones it fails (default false)',
  })
  @ApiCreatedResponse({ type: BackfillListingImagesResultDto })
  @ApiNotFoundResponse({ description: 'Listing not found or not owned' })
  backfillImages(
    @Param('listingId', ParseIntPipe) listingId: number,
    @CurrentUser('sub') userId: number,
    @Query('minImages') minImages?: string,
    @Query('dedupe') dedupe?: string,
    @Query('recheck') recheck?: string,
  ): Promise<BackfillListingImagesResultDto> {
    const min = Math.min(Math.max(parseInt(minImages ?? '1', 10) || 1, 1), 5);
    const flag = (v?: string) => v === 'true' || v === '1';
    return this.tripGenerator.backfillListingImages(
      listingId,
      userId,
      min,
      flag(dedupe),
      flag(recheck),
    );
  }

  @Post('listings/:listingId/sync-images-from/:sourceListingId')
  @ApiOperation({
    operationId: 'syncListingImagesFrom',
    summary:
      'Make a translated twin carry exactly the photos of its source listing (matched by day and position). Shares the storage keys, keeps the listing status. Fails when the two itineraries do not line up.',
  })
  @ApiParam({ name: 'listingId', type: 'integer' })
  @ApiParam({ name: 'sourceListingId', type: 'integer' })
  @ApiCreatedResponse({ type: SyncListingImagesResultDto })
  @ApiNotFoundResponse({ description: 'Listing not found or not owned' })
  syncImagesFrom(
    @Param('listingId', ParseIntPipe) listingId: number,
    @Param('sourceListingId', ParseIntPipe) sourceListingId: number,
    @CurrentUser('sub') userId: number,
  ): Promise<SyncListingImagesResultDto> {
    return this.tripGenerator.syncListingImagesFrom(
      listingId,
      sourceListingId,
      userId,
    );
  }
}
