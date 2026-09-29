import { useState } from 'react';
import { Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAppLanguage } from '@/i18n';
import { requireOnline } from '@/offline/guardOnline';
import { useScanCredits } from './api/queries';
import { extractionUrl } from './helpers/sourceUrl';
import type { CreditError } from './types';
export function usePinLauncher() {
  useAppLanguage();
  const { t } = useTranslation();
  const quota = useScanCredits();
  const [checking, setChecking] = useState(false);
  const [gate, setGate] = useState<CreditError | null>(null);
  const paste = async () => {
    if (checking || !requireOnline(t)) return;
    setChecking(true);
    try {
      const sourceUrl = extractionUrl(await Clipboard.getStringAsync());
      if (!sourceUrl) {
        Alert.alert(t('Paste a valid TikTok or Instagram link.'));
        return;
      }
      const balance = await quota.refetch();
      if (!balance.data || balance.isError) {
        Alert.alert(t('Please check your connection and try again.'));
        return;
      }
      if (balance.data.available <= 0) {
        setGate({ ...balance.data, canPurchase: true } as CreditError);
        return;
      }
      router.push({ pathname: '/board/extract', params: { sourceUrl } });
    } catch {
      Alert.alert(t('Something went wrong'));
    } finally {
      setChecking(false);
    }
  };
  return { paste, checking, gate, closeGate: () => setGate(null), quota };
}
