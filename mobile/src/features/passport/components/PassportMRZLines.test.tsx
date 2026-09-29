import { render } from '@testing-library/react-native';

import { mrzLineOne, mrzLineTwo } from '@/features/passport/helpers/mrz';

import { PassportMRZLines } from './PassportMRZLines';

describe('PassportMRZLines', () => {
  it('renders the two MRZ lines produced by the helpers', async () => {
    const screen = await render(
      <PassportMRZLines displayName="Danny Dinh" memberSince="2025-01-01T00:00:00.000Z" />,
    );
    expect(screen.getByText(mrzLineOne('Danny Dinh', '2025-01-01T00:00:00.000Z'))).toBeTruthy();
    expect(screen.getByText(mrzLineTwo('2025-01-01T00:00:00.000Z'))).toBeTruthy();
  });

  it('falls back to the MEMBER token and default date for a null memberSince', async () => {
    const screen = await render(<PassportMRZLines displayName="" memberSince={null} />);
    expect(screen.getByText(mrzLineOne('', null))).toBeTruthy();
    expect(screen.getByText(mrzLineTwo(null))).toBeTruthy();
  });
});
