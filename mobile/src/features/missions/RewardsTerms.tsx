import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { Linking, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppLanguage } from '@/i18n';
import { DismissButton } from '@/ui/components/AppSheet';
import { beVietnamPro } from '@/ui/typography';
import { rewardTerms } from './terms';
function LinkedText({ text }: { text: string }) {
  return (
    <Text style={{ ...beVietnamPro(15), letterSpacing: -0.6, color: '#545454' }}>
      {text.split(/(\[[^\]]+\]\(https:\/\/[^)]+\))/).map((part, index) => {
        const match = /^\[([^\]]+)\]\((https:\/\/[^)]+)\)$/.exec(part);
        return match ? (
          <Text
            key={index}
            accessibilityRole="link"
            onPress={() => {
              void Linking.openURL(match[2]!).catch(() => undefined);
            }}
            style={{ color: '#335CFF' }}
          >
            {match[1]}
          </Text>
        ) : (
          part
        );
      })}
    </Text>
  );
}
export function RewardsTerms({ dismiss }: { dismiss: () => void }) {
  useAppLanguage();
  const { t } = useTranslation();
  return (
    <BottomSheetScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ padding: 24, gap: 20 }}
    >
      <DismissButton onPress={dismiss} accessibilityLabel={t('Close')} />
      <Text
        accessibilityRole="header"
        style={{ ...beVietnamPro(28, 'medium'), letterSpacing: -1.96 }}
      >
        {t('Rewards Program Terms')}
      </Text>
      <View style={{ gap: 4 }}>
        <LinkedText text={t('Last updated: 12 Aug 2026')} />
        {rewardTerms.map((term, index) => (
          <View key={term} style={{ flexDirection: 'row', gap: 4 }}>
            <Text style={{ ...beVietnamPro(15), width: 20 }}>{index + 1}.</Text>
            <View style={{ flex: 1 }}>
              <LinkedText text={t(term)} />
            </View>
          </View>
        ))}
        <LinkedText text={t('Questions? Reach us via Help in the app.')} />
      </View>
    </BottomSheetScrollView>
  );
}
