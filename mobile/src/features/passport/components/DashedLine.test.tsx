import { render } from '@testing-library/react-native';

import { DashedLine } from './DashedLine';

describe('DashedLine', () => {
  it('renders with the default dashed border color', async () => {
    const screen = await render(<DashedLine testID="dashed" />);
    const view = screen.getByTestId('dashed');
    const flatStyle = Object.assign({}, ...[view.props.style].flat());
    expect(flatStyle.borderStyle).toBe('dashed');
    expect(flatStyle.borderColor).toBe('#D4D4D4');
  });

  it('applies a custom color', async () => {
    const screen = await render(<DashedLine testID="dashed" color="#FF0000" />);
    const view = screen.getByTestId('dashed');
    const flatStyle = Object.assign({}, ...[view.props.style].flat());
    expect(flatStyle.borderColor).toBe('#FF0000');
  });
});
