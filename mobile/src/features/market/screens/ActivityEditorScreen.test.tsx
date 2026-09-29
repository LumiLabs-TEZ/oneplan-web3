import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { initI18n } from '@/i18n';

import { useActivityDraft } from '../editor/activityDraft';
import ActivityEditorScreen from './ActivityEditorScreen';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
  useNavigation: () => ({ dispatch: jest.fn() }),
  useFocusEffect: () => undefined,
}));
jest.mock('expo-router/react-navigation', () => ({ usePreventRemove: () => undefined }));

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const renderScreen = () =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ActivityEditorScreen />
    </SafeAreaProvider>,
  );

describe('ActivityEditorScreen', () => {
  beforeAll(() => {
    initI18n();
  });

  beforeEach(() => {
    mockBack.mockClear();
  });

  it('a new plan has no trash and saves only once named', async () => {
    useActivityDraft
      .getState()
      .begin(
        's',
        { key: 'k', dayNumber: 1, title: '', imageUrls: [] },
        { dayCount: 2, isNew: true },
      );
    const screen = await renderScreen();
    expect(screen.queryByTestId('market-activity-delete')).toBeNull();

    await fireEvent.press(screen.getByTestId('market-activity-save'));
    expect(useActivityDraft.getState().result).toBeNull();

    await fireEvent.press(screen.getByTestId('market-activity-day-2'));
    await fireEvent.changeText(screen.getByTestId('market-activity-title'), 'Shibuya');
    await fireEvent.press(screen.getByTestId('market-activity-save'));
    expect(useActivityDraft.getState().result).toMatchObject({
      kind: 'save',
      activity: { title: 'Shibuya', dayNumber: 2 },
    });
    expect(mockBack).toHaveBeenCalled();
  });

  it('an existing plan shows the trash button', async () => {
    useActivityDraft
      .getState()
      .begin('s', { key: 'k', dayNumber: 1, title: 'Cafe' }, { dayCount: 1, isNew: false });
    const screen = await renderScreen();
    expect(screen.getByTestId('market-activity-delete')).toBeTruthy();
  });
});
