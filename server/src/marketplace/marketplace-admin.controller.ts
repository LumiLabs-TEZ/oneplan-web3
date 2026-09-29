import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { MarketplaceListingStatus } from '@prisma/client';
import { AdminOnly } from '../auth/decorators/admin-only.decorator';
import { MarketplaceListingDto } from './dto/marketplace-listing.dto';
import { ReorderFeaturedListingsDto } from './dto/reorder-featured-listings.dto';
import { MarketplaceService } from './marketplace.service';
import { ListingTranslationsDto } from './dto/listing-translations.dto';
import {
  GenerateListingTranslationDto,
  UpsertListingTranslationDto,
} from './dto/upsert-listing-translation.dto';
import { MarketplaceTranslationService } from './translation/marketplace-translation.service';

@ApiTags('Marketplace Admin')
@Controller('marketplace/admin')
export class MarketplaceAdminController {
  constructor(
    private readonly marketplaceService: MarketplaceService,
    private readonly translations: MarketplaceTranslationService,
  ) {}

  // ── Translations ───────────────────────────────────────────────────

  @Get('listings/:id/translations')
  @AdminOnly()
  @ApiOperation({
    operationId: 'adminGetListingTranslations',
    summary:
      'Base text plus every stored translation of a listing and its items.',
  })
  @ApiParam({ name: 'id', type: 'integer' })
  @ApiOkResponse({ type: ListingTranslationsDto })
  @ApiNotFoundResponse({ description: 'Listing not found' })
  adminGetListingTranslations(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ListingTranslationsDto> {
    return this.translations.getTranslations(id);
  }

  @Put('listings/:id/translations')
  @AdminOnly()
  @ApiOperation({
    operationId: 'adminUpsertListingTranslation',
    summary:
      'Create or replace the translation of a listing (and its items) for one locale. Never changes listing status.',
  })
  @ApiParam({ name: 'id', type: 'integer' })
  @ApiOkResponse({ type: ListingTranslationsDto })
  @ApiBadRequestResponse({ description: 'Locale equals the source locale' })
  @ApiNotFoundResponse({ description: 'Listing or item not found' })
  adminUpsertListingTranslation(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpsertListingTranslationDto,
  ): Promise<ListingTranslationsDto> {
    return this.translations.upsertTranslation(id, dto);
  }

  @Post('listings/:id/translations/generate')
  @AdminOnly()
  @ApiOperation({
    operationId: 'adminGenerateListingTranslation',
    summary:
      'Translate the base text into the given locale with Gemini and store it (overwrites an existing translation).',
  })
  @ApiParam({ name: 'id', type: 'integer' })
  @ApiOkResponse({ type: ListingTranslationsDto })
  @ApiBadRequestResponse({ description: 'Locale equals the source locale' })
  @ApiNotFoundResponse({ description: 'Listing not found' })
  adminGenerateListingTranslation(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: GenerateListingTranslationDto,
  ): Promise<ListingTranslationsDto> {
    return this.translations.generateTranslation(id, dto.locale);
  }

  @Get('listings')
  @AdminOnly()
  @ApiOperation({
    operationId: 'adminListListings',
    summary:
      'List marketplace listings filtered by status (admin review queue).',
  })
  @ApiQuery({
    name: 'status',
    enum: MarketplaceListingStatus,
    required: false,
    description: 'Defaults to PENDING_REVIEW.',
  })
  @ApiOkResponse({ type: [MarketplaceListingDto] })
  adminListListings(
    @Query('status') status?: MarketplaceListingStatus,
  ): Promise<MarketplaceListingDto[]> {
    const target = status ?? MarketplaceListingStatus.PENDING_REVIEW;
    return this.marketplaceService.adminListListings(target);
  }

  @Get('listings/by-public-id/:publicId')
  @AdminOnly()
  @ApiOperation({
    operationId: 'adminGetListingByPublicId',
    summary:
      'Fetch a single marketplace listing by publicId (admin review view).',
  })
  @ApiParam({ name: 'publicId', type: 'string' })
  @ApiOkResponse({ type: MarketplaceListingDto })
  @ApiNotFoundResponse({ description: 'Listing not found' })
  adminGetListingByPublicId(
    @Param('publicId') publicId: string,
  ): Promise<MarketplaceListingDto> {
    return this.marketplaceService.adminGetListingByPublicId(publicId);
  }

  @Post('listings/:id/approve')
  @AdminOnly()
  @ApiOperation({
    operationId: 'adminApproveListing',
    summary: 'Approve a marketplace listing (set status=APPROVED).',
  })
  @ApiParam({ name: 'id', type: 'integer' })
  @ApiOkResponse({ type: MarketplaceListingDto })
  @ApiNotFoundResponse({ description: 'Listing not found' })
  adminApproveListing(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<MarketplaceListingDto> {
    return this.marketplaceService.adminSetListingStatus(
      id,
      MarketplaceListingStatus.APPROVED,
    );
  }

  @Post('listings/:id/return-to-review')
  @AdminOnly()
  @ApiOperation({
    operationId: 'adminReturnListingToReview',
    summary:
      'Send a marketplace listing back through review (set status=PENDING_REVIEW).',
  })
  @ApiParam({ name: 'id', type: 'integer' })
  @ApiOkResponse({ type: MarketplaceListingDto })
  @ApiNotFoundResponse({ description: 'Listing not found' })
  adminReturnListingToReview(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<MarketplaceListingDto> {
    return this.marketplaceService.adminSetListingStatus(
      id,
      MarketplaceListingStatus.PENDING_REVIEW,
    );
  }

  @Post('listings/:id/reject')
  @AdminOnly()
  @ApiOperation({
    operationId: 'adminRejectListing',
    summary: 'Reject a marketplace listing (set status=REJECTED).',
  })
  @ApiParam({ name: 'id', type: 'integer' })
  @ApiOkResponse({ type: MarketplaceListingDto })
  @ApiNotFoundResponse({ description: 'Listing not found' })
  adminRejectListing(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<MarketplaceListingDto> {
    return this.marketplaceService.adminSetListingStatus(
      id,
      MarketplaceListingStatus.REJECTED,
    );
  }

  @Get('featured')
  @AdminOnly()
  @ApiOperation({
    operationId: 'adminListFeaturedListings',
    summary:
      'List featured marketplace listings in display order (array order IS the featured order).',
  })
  @ApiOkResponse({ type: [MarketplaceListingDto] })
  adminListFeaturedListings(): Promise<MarketplaceListingDto[]> {
    return this.marketplaceService.adminListFeaturedListings();
  }

  @Post('listings/:id/feature')
  @AdminOnly()
  @ApiOperation({
    operationId: 'adminFeatureListing',
    summary:
      'Feature an approved listing on the app Home "Popular plans" section (appended last). Idempotent.',
  })
  @ApiParam({ name: 'id', type: 'integer' })
  @ApiOkResponse({ type: MarketplaceListingDto })
  @ApiNotFoundResponse({ description: 'Listing not found' })
  @ApiBadRequestResponse({ description: 'Listing is not approved' })
  adminFeatureListing(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<MarketplaceListingDto> {
    return this.marketplaceService.adminFeatureListing(id);
  }

  @Post('listings/:id/unfeature')
  @AdminOnly()
  @ApiOperation({
    operationId: 'adminUnfeatureListing',
    summary: 'Remove a listing from the featured set. Idempotent.',
  })
  @ApiParam({ name: 'id', type: 'integer' })
  @ApiOkResponse({ type: MarketplaceListingDto })
  @ApiNotFoundResponse({ description: 'Listing not found' })
  adminUnfeatureListing(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<MarketplaceListingDto> {
    return this.marketplaceService.adminUnfeatureListing(id);
  }

  @Put('featured/order')
  @AdminOnly()
  @ApiOperation({
    operationId: 'adminReorderFeaturedListings',
    summary:
      'Rewrite the featured display order. Body must contain exactly the currently featured listing ids.',
  })
  @ApiOkResponse({ type: [MarketplaceListingDto] })
  @ApiBadRequestResponse({
    description: 'listingIds does not match the currently featured set',
  })
  adminReorderFeaturedListings(
    @Body() dto: ReorderFeaturedListingsDto,
  ): Promise<MarketplaceListingDto[]> {
    return this.marketplaceService.adminReorderFeatured(dto.listingIds);
  }
}
