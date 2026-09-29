import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MarketplaceListingStatus } from '@prisma/client';
import { AdminGuard } from '../auth/guards/admin.guard';
import { MarketplaceAdminController } from './marketplace-admin.controller';
import { MarketplaceService } from './marketplace.service';
import { MarketplaceTranslationService } from './translation/marketplace-translation.service';

function buildContext(email: string | undefined): ExecutionContext {
  const req = email ? { user: { email } } : { user: undefined };
  return {
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  } as unknown as ExecutionContext;
}

describe('MarketplaceAdminController', () => {
  let controller: MarketplaceAdminController;
  let marketplaceService: jest.Mocked<MarketplaceService>;
  let translationService: jest.Mocked<MarketplaceTranslationService>;

  beforeEach(() => {
    marketplaceService = {
      adminListListings: jest.fn(),
      adminSetListingStatus: jest.fn(),
    } as unknown as jest.Mocked<MarketplaceService>;
    translationService = {
      getTranslations: jest.fn(),
      upsertTranslation: jest.fn(),
      generateTranslation: jest.fn(),
    } as unknown as jest.Mocked<MarketplaceTranslationService>;

    controller = new MarketplaceAdminController(
      marketplaceService,
      translationService,
    );
  });

  it('lists pending listings by default and respects an explicit status', async () => {
    const pending = [{ id: 1 }] as any;
    const approved = [{ id: 2 }] as any;
    marketplaceService.adminListListings
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce(approved);

    await expect(controller.adminListListings()).resolves.toBe(pending);
    await expect(
      controller.adminListListings(MarketplaceListingStatus.APPROVED),
    ).resolves.toBe(approved);

    expect(marketplaceService.adminListListings).toHaveBeenNthCalledWith(
      1,
      MarketplaceListingStatus.PENDING_REVIEW,
    );
    expect(marketplaceService.adminListListings).toHaveBeenNthCalledWith(
      2,
      MarketplaceListingStatus.APPROVED,
    );
  });

  it('approve and reject delegate to adminSetListingStatus with the right status', async () => {
    const result = { id: 7 } as any;
    marketplaceService.adminSetListingStatus.mockResolvedValue(result);

    await expect(controller.adminApproveListing(7)).resolves.toBe(result);
    await expect(controller.adminRejectListing(7)).resolves.toBe(result);

    expect(marketplaceService.adminSetListingStatus).toHaveBeenNthCalledWith(
      1,
      7,
      MarketplaceListingStatus.APPROVED,
    );
    expect(marketplaceService.adminSetListingStatus).toHaveBeenNthCalledWith(
      2,
      7,
      MarketplaceListingStatus.REJECTED,
    );
  });
});

describe('AdminGuard', () => {
  function buildGuard(emails: string[]): AdminGuard {
    const config = {
      get: jest.fn((key: string) =>
        key === 'admin.emails' ? emails : undefined,
      ),
    } as unknown as ConfigService;
    return new AdminGuard(config);
  }

  it('allows admins (case-insensitive)', () => {
    const guard = buildGuard(['dev@example.com']);
    expect(guard.canActivate(buildContext('Dev@LumiLabs.Space'))).toBe(true);
  });

  it('rejects non-admins with ForbiddenException', () => {
    const guard = buildGuard(['dev@example.com']);
    expect(() => guard.canActivate(buildContext('user@example.com'))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects unauthenticated requests with UnauthorizedException', () => {
    const guard = buildGuard(['dev@example.com']);
    expect(() => guard.canActivate(buildContext(undefined))).toThrow();
  });
});
