import { ReceiptIcon } from '@/features/receipt/components/ReceiptIcon';
import { useFocusEffect } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { File } from 'expo-file-system';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, BackHandler, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mutationErrorMessage } from '@/api/mutationError';
import type { TripMemberDto } from '@/features/trip/types';
import { useAppLanguage } from '@/i18n';
import { CURRENCIES, currencyFromCode, type Currency } from '@/lib/currency';
import { ReceiptCamera } from '@/native/camera/ReceiptCamera';
import { prepareReceiptPhoto, type ReceiptPhoto } from '@/native/camera/receiptImage';
import { requireOnline } from '@/offline/guardOnline';
import { colors } from '@/ui/theme';
import { useCreateReceiptExpense, useScanReceipt } from './api/mutations';
import {
  createAssignmentState,
  RECEIPT_NAME_MAX_LENGTH,
  receiptCurrency,
  receiptPayload,
  type AssignmentState,
} from './assignment';
import { ReceiptAssignment } from './components/ReceiptAssignment';
import { ReceiptProgress } from './components/ReceiptProgress';

type Step = 'capture' | 'parsing' | 'assign' | 'saving';
export function ReceiptFlow({
  tripId,
  members,
  localCurrency,
  homeCurrency,
  onDismiss,
  onSaved,
  requirePro,
}: {
  tripId: number;
  members: TripMemberDto[];
  localCurrency?: string;
  homeCurrency?: string;
  onDismiss: () => void;
  onSaved: () => void;
  requirePro: (allowed: () => void) => void;
}) {
  useAppLanguage();
  const { t } = useTranslation();
  // Hook, not `SafeAreaView`: the native view reports zero insets inside this route's
  // fullScreenModal (same workaround as `paywall.tsx`).
  const insets = useSafeAreaInsets();
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  const scan = useScanReceipt(tripId);
  const save = useCreateReceiptExpense(tripId);
  const [step, setStep] = useState<Step>('capture');
  const [photo, setPhoto] = useState<ReceiptPhoto>();
  const [assignment, setAssignment] = useState<AssignmentState>();
  const [currency, setCurrency] = useState<Currency>(CURRENCIES.VND);
  const [name, setName] = useState('');
  const locked = useRef(false);
  const mounted = useRef(true);
  const processedFiles = useRef<string[]>([]);
  useEffect(() => {
    mounted.current = true;
    const files = processedFiles.current;
    return () => {
      mounted.current = false;
      files.forEach((uri) => {
        try {
          new File(uri).delete();
        } catch {
          /* Cache may already have been reclaimed. */
        }
      });
    };
  }, []);
  const retake = useCallback(() => {
    setStep('capture');
    setPhoto(undefined);
    setAssignment(undefined);
    locked.current = false;
  }, []);
  const error = useCallback(
    (message: string) => {
      Alert.alert(t('Error'), message, [{ text: t('Retake'), onPress: retake }], {
        cancelable: false,
      });
    },
    [retake, t],
  );
  useEffect(() => {
    if (!focused) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step === 'assign') retake();
      else if (step === 'capture') onDismiss();
      return true;
    });
    return () => subscription.remove();
  }, [focused, step, retake, onDismiss]);
  const allowed = () => {
    let pro = false;
    requirePro(() => {
      pro = true;
    });
    return pro && requireOnline(t);
  };
  const parsePhoto = async (captured: ReceiptPhoto) => {
    if (locked.current || !allowed()) return;
    locked.current = true;
    setPhoto(captured);
    setStep('parsing');
    try {
      const resized = await prepareReceiptPhoto(captured);
      if (!mounted.current) {
        new File(resized.uri).delete();
        return;
      }
      processedFiles.current.push(resized.uri);
      const result = await scan.mutateAsync(resized.uri);
      if (!mounted.current) return;
      if (!result.items.length) {
        error(t('No items detected in the receipt.'));
        return;
      }
      const resolved = receiptCurrency(localCurrency, homeCurrency, result.currency);
      const state = createAssignmentState(result, members, resolved, randomUUID);
      if (!state.items.length) {
        error(t('No items detected in the receipt.'));
        return;
      }
      setCurrency(resolved);
      setAssignment(state);
      setName((result.restaurantName ?? t('Receipt')).slice(0, RECEIPT_NAME_MAX_LENGTH));
      setStep('assign');
    } catch (e) {
      if (mounted.current)
        error(mutationErrorMessage(e, t('Could not read the receipt. Try a clearer photo.')));
    } finally {
      locked.current = false;
    }
  };
  const confirm = async (state: AssignmentState) => {
    if (locked.current || !state.history.length || !allowed()) return;
    locked.current = true;
    setAssignment(state);
    setStep('saving');
    try {
      await save.mutateAsync(
        receiptPayload(
          state,
          currency,
          currencyFromCode(homeCurrency) ?? CURRENCIES.VND,
          name,
          t('Receipt: %@', { 0: name }),
          new Date(),
        ),
      );
      if (mounted.current) onSaved();
    } catch (e) {
      if (mounted.current) {
        setStep('assign');
        error(mutationErrorMessage(e, t('Failed to create expense. Please try again.')));
      }
    } finally {
      locked.current = false;
    }
  };
  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {step === 'capture' ? (
        <>
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('Back')}
              style={styles.back}
              onPress={onDismiss}
            >
              <ReceiptIcon name="back" size={14} color={colors.contentB} />
            </Pressable>
          </View>
          <ReceiptCamera
            active={focused}
            canCapture={allowed}
            onPhoto={(p) => void parsePhoto(p)}
            onError={error}
          />
        </>
      ) : null}
      {step === 'parsing' && photo ? <ReceiptProgress photoUri={photo.uri} /> : null}
      {step === 'assign' && assignment ? (
        <ReceiptAssignment
          initialState={assignment}
          currency={currency}
          restaurantName={name}
          onNameChange={setName}
          onBack={retake}
          onConfirm={(s) => void confirm(s)}
        />
      ) : null}
      {step === 'saving' ? <ReceiptProgress /> : null}
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.neutral50 },
  header: { height: 54, paddingHorizontal: 16, paddingBottom: 10 },
  back: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: '#FFFFFFE6',
    boxShadow: '0px 8px 28px rgba(0,0,0,0.06)',
  },
});
