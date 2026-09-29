/**
 * Display-name edit sheet — port of `EditDisplayNameSheet` (SettingView.swift:714) +
 * `commitDisplayNameEditIfNeeded` (SettingView.swift:609). Commits on the keyboard's return key
 * and on dismiss (X button or swipe), guarded so a change is only ever committed once per
 * `present()` (mirrors iOS `didCommitDisplayNameChange`).
 */
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { FriendRequestDismissButton } from '@/features/friends/components';
import { commitDisplayName } from '@/features/settings/helpers/displayName';
import { useAppLanguage } from '@/i18n';
import { useKeyboardHeight } from '@/lib/useKeyboardHeight';
import { AppSheet, type AppSheetRef } from '@/ui/components';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

/** `AppSheet`'s floating-sheet gap above the home indicator / keyboard. */
const FLOATING_INSET = 9;

export interface EditDisplayNameSheetProps {
  initial: string;
  saving: boolean;
  onCommit: (value: string) => void;
}

export interface EditDisplayNameSheetRef {
  present: () => void;
  dismiss: () => void;
}

export const EditDisplayNameSheet = forwardRef<EditDisplayNameSheetRef, EditDisplayNameSheetProps>(
  function EditDisplayNameSheet({ initial, saving, onCommit }, ref) {
    useAppLanguage();
    const { t } = useTranslation();
    const sheetRef = useRef<AppSheetRef>(null);
    const originalRef = useRef(initial);
    const committedRef = useRef(false);
    const [value, setValue] = useState(initial);
    // Ride above the keyboard like SwiftUI's `.medium` sheet. iOS: the floating (detached) sheet
    // ignores gorhom's keyboard offset, so lift it via `bottomInset`. Android: edge-to-edge means
    // `adjustResize` never shrinks the window and gorhom skips its offset in that mode (and ignores
    // `bottomInset` changes while the keyboard is up), so tell gorhom `adjustPan` to lift it itself.
    const keyboardHeight = useKeyboardHeight();

    useImperativeHandle(ref, () => ({
      present: () => {
        originalRef.current = initial;
        committedRef.current = false;
        setValue(initial);
        sheetRef.current?.present();
      },
      dismiss: () => sheetRef.current?.dismiss(),
    }));

    const commitIfNeeded = () => {
      if (committedRef.current) return;
      const result = commitDisplayName(originalRef.current, value);
      if (result.commit) {
        committedRef.current = true;
        onCommit(result.value);
      }
    };

    const commitAndDismiss = () => {
      commitIfNeeded();
      sheetRef.current?.dismiss();
    };

    return (
      <AppSheet
        ref={sheetRef}
        snapPoints={['50%']}
        bottomInset={Platform.OS === 'ios' ? keyboardHeight + FLOATING_INSET : FLOATING_INSET}
        android_keyboardInputMode="adjustPan"
        backgroundColor={colors.neutral50}
        enablePanDownToClose={!saving}
        onDismiss={commitIfNeeded}
      >
        <View style={styles.content}>
          <Text style={styles.label}>{t('What’s your name?')}</Text>
          <BottomSheetTextInput
            value={value}
            onChangeText={setValue}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={commitAndDismiss}
            editable={!saving}
            style={styles.input}
            testID="display-name-input"
          />
        </View>
        <FriendRequestDismissButton
          onPress={commitAndDismiss}
          disabled={saving}
          accessibilityLabel={t('Cancel')}
          style={[styles.dismiss, saving && styles.dismissSaving]}
          testID="display-name-dismiss"
        />
      </AppSheet>
    );
  },
);

const styles = StyleSheet.create({
  // SwiftUI: label + field centred in the space above a 122pt bottom band holding the ✕.
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
    paddingHorizontal: spacing.lg,
    // 122 − (52pt button + 51pt inset) so the text block matches SwiftUI.
    paddingBottom: 122 - 52 - 51,
  },
  label: { ...beVietnamPro(15), color: colors.neutral700, letterSpacing: -0.75 },
  input: {
    ...beVietnamPro(48),
    alignSelf: 'stretch',
    color: colors.contentB,
    letterSpacing: -2.4,
    textAlign: 'center',
    padding: 0,
  },
  dismiss: { alignSelf: 'center', marginBottom: 51 },
  dismissSaving: { opacity: 0.6 },
});
