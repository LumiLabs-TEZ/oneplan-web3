import { ActivityIndicator, View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppLanguage } from '@/i18n';
import { Button } from '@/ui/components';
import { beVietnamPro } from '@/ui/typography';
export function MarketState({
  loading,
  error,
  retry,
}: {
  loading?: boolean;
  error?: boolean;
  retry?: () => void;
}) {
  useAppLanguage();
  const { t } = useTranslation();
  return (
    <View style={styles.state}>
      {loading ? (
        <ActivityIndicator />
      ) : (
        <>
          <Text style={styles.text}>{t(error ? 'Something went wrong' : 'No plans yet')}</Text>
          {error && retry ? <Button title={t('Try again')} onPress={retry} /> : null}
        </>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  state: { padding: 32, alignItems: 'center', gap: 16 },
  text: { ...beVietnamPro(16) },
});
