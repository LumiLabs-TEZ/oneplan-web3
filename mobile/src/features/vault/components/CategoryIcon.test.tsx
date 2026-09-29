import { render } from '@testing-library/react-native';

import { EXPENSE_CATEGORIES } from '@/features/expense/categories';

import { CategoryIcon } from './CategoryIcon';

describe('CategoryIcon', () => {
  it('renders an emoji fallback for park (no Swift iconAsset)', async () => {
    const screen = await render(<CategoryIcon category="PARK" />);
    expect(screen.getByText('🌵')).toBeTruthy();
  });

  it('renders an emoji fallback for other (no Swift iconAsset)', async () => {
    const screen = await render(<CategoryIcon category="OTHER" />);
    expect(screen.getByText('🧾')).toBeTruthy();
  });

  it.each(
    EXPENSE_CATEGORIES.map((c) => c.value).filter((v) => v !== 'PARK' && v !== 'OTHER'),
  )('renders the illustrated icon (no emoji text) for %s', async (category) => {
    const screen = await render(<CategoryIcon category={category} />);
    expect(screen.queryByText(/./u)).toBeNull();
  });

  it('sizes the fallback emoji frame to the requested size', async () => {
    const screen = await render(<CategoryIcon category="OTHER" size={60} />);
    const text = screen.getByText('🧾');
    expect(text.props.style).toMatchObject({ fontSize: 60 * 0.62 });
  });
});
