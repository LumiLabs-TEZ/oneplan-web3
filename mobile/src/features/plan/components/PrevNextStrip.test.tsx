import { fireEvent, render, screen } from '@testing-library/react-native';

import { initI18n } from '@/i18n';

import { PrevNextStrip } from './PrevNextStrip';
import type { PlanItemDto } from '../types';

beforeAll(() => {
  initI18n();
});

function makeItem(overrides: Partial<PlanItemDto> = {}): PlanItemDto {
  return {
    id: 1,
    tripId: 1,
    title: 'Breakfast',
    imageUrls: [],
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    members: [],
    ...overrides,
  };
}

describe('PrevNextStrip', () => {
  it('disables the prev button when there is no previous sibling', async () => {
    const onPrev = jest.fn();
    await render(
      <PrevNextStrip
        prev={null}
        next={makeItem({ id: 2, title: 'Lunch' })}
        onPrev={onPrev}
        onNext={jest.fn()}
      />,
    );
    await fireEvent.press(screen.getByTestId('plan-detail-prev'));
    expect(onPrev).not.toHaveBeenCalled();
  });

  it('disables the next button when there is no next sibling', async () => {
    const onNext = jest.fn();
    await render(
      <PrevNextStrip
        prev={makeItem({ id: 2, title: 'Lunch' })}
        next={null}
        onPrev={jest.fn()}
        onNext={onNext}
      />,
    );
    await fireEvent.press(screen.getByTestId('plan-detail-next'));
    expect(onNext).not.toHaveBeenCalled();
  });

  it('fires onPrev with the sibling item when pressed', async () => {
    const onPrev = jest.fn();
    const prev = makeItem({ id: 5, title: 'Coffee' });
    await render(<PrevNextStrip prev={prev} next={null} onPrev={onPrev} onNext={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('plan-detail-prev'));
    expect(onPrev).toHaveBeenCalledWith(prev);
  });

  it('fires onNext with the sibling item when pressed', async () => {
    const onNext = jest.fn();
    const next = makeItem({ id: 6, title: 'Dinner' });
    await render(<PrevNextStrip prev={null} next={next} onPrev={jest.fn()} onNext={onNext} />);
    await fireEvent.press(screen.getByTestId('plan-detail-next'));
    expect(onNext).toHaveBeenCalledWith(next);
  });

  it('shows static "Prev"/"Next" labels regardless of the sibling title', async () => {
    await render(
      <PrevNextStrip
        prev={makeItem({ id: 5, title: 'Coffee' })}
        next={makeItem({ id: 6, title: 'Dinner' })}
        onPrev={jest.fn()}
        onNext={jest.fn()}
      />,
    );
    expect(screen.getByText('Prev')).toBeTruthy();
    expect(screen.getByText('Next')).toBeTruthy();
    expect(screen.queryByText('Coffee')).toBeNull();
    expect(screen.queryByText('Dinner')).toBeNull();
  });
});
