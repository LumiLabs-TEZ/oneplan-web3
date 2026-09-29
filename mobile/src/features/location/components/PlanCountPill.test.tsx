import { render, screen } from '@testing-library/react-native';

import { initI18n } from '@/i18n';

import { PlanCountPill } from './PlanCountPill';

const mockUseLocationPlanCount = jest.fn();

jest.mock('@/features/plan/api/queries', () => ({
  useLocationPlanCount: (location: string) => mockUseLocationPlanCount(location),
}));

beforeAll(() => {
  initI18n();
});

afterEach(() => {
  mockUseLocationPlanCount.mockReset();
});

describe('PlanCountPill', () => {
  it('renders nothing until the count resolves', async () => {
    mockUseLocationPlanCount.mockReturnValue({ data: undefined, isLoading: true });
    await render(<PlanCountPill location="Da Lat" testID="plan-count" />);
    expect(screen.queryByTestId('plan-count')).toBeNull();
  });

  it('shows the count when there are prior additions', async () => {
    mockUseLocationPlanCount.mockReturnValue({ data: 5, isLoading: false });
    await render(<PlanCountPill location="Da Lat" testID="plan-count" />);
    expect(screen.getByText('5+ added to plan')).toBeTruthy();
  });

  it('shows the "be the first" copy when the count is zero', async () => {
    mockUseLocationPlanCount.mockReturnValue({ data: 0, isLoading: false });
    await render(<PlanCountPill location="Da Lat" testID="plan-count" />);
    expect(screen.getByText('Be the first to add to plan')).toBeTruthy();
  });
});
