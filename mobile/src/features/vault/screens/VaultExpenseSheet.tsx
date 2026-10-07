/**
 * Collects the expense side of a vault payment: what it was, who paid, who splits it — port of
 * `ios/OnePlan/OnePlan/View/Vault/VaultExpenseSheet.swift` (`feat/web3-version`), shown before the
 * money moves so the trip ledger never holds an unexplained transfer.
 *
 * The payer is the group or the member holding the phone — never another member: only the caller
 * can sign for their own wallet, so `payer` is typed directly as the wire `VaultTxSource`
 * (`VAULT` = Group, `PERSONAL` = Me) rather than a separate local enum that would just get mapped
 * back at the call site.
 */
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { components } from '@/api/schema';
import { categoryOption, type ExpenseCategory } from '@/features/expense/categories';
import { MemberPickerChip } from '@/features/expense/components/MemberPickerChip';
import { CategoryIcon } from '@/features/vault/components';
import { useAppLanguage } from '@/i18n';
import { AppSheet, type AppSheetRef, Button, SFSymbol } from '@/ui/components';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { CategoryPickerSheet, useCategoryPicker } from '../components/CategoryPickerSheet';

type TripMemberDto = components['schemas']['TripMemberDto'];
type UserProfileDto = components['schemas']['UserProfileDto'];
/** `VAULT` = the group wallet pays ("Group"). `PERSONAL` = the caller's own wallet ("Me"). */
type VaultPayerSource = components['schemas']['VaultTxSource'];

export interface VaultExpenseDetails {
  name: string;
  category: ExpenseCategory;
  payer: VaultPayerSource;
  /** Empty means everyone shares — send this literally, not every member id (breaks history UI). */
  shareWithUserIds: number[];
}

export interface VaultExpenseSheetProps {
  members: readonly TripMemberDto[];
  /** `undefined` while the profile has not loaded; the "Me" chip then shows an initial. */
  currentUser?: UserProfileDto;
  /** USDC in the member's own wallet, shown once "Me" is chosen. `undefined` hides the hint. */
  personalBalanceUsdc?: number;
  /** `false` greys out "Group" and pays from the member's own wallet. Defaults to `true`. */
  groupCanCover?: boolean;
  /** Used when the name is left blank. */
  fallbackName?: string;
  /** A payment is in flight: the sheet is the topmost thing on screen, so the progress shows here. */
  isWorking?: boolean;
  onDone: (details: VaultExpenseDetails) => void;
  onDismiss?: () => void;
}

export interface VaultExpenseSheetRef {
  present: () => void;
  dismiss: () => void;
}

export const VaultExpenseSheet = forwardRef<VaultExpenseSheetRef, VaultExpenseSheetProps>(
  function VaultExpenseSheet(
    {
      members,
      currentUser,
      personalBalanceUsdc,
      groupCanCover = true,
      fallbackName = '',
      isWorking = false,
      onDone,
      onDismiss,
    },
    ref,
  ) {
    useAppLanguage();
    const { t } = useTranslation();
    const sheetRef = useRef<AppSheetRef>(null);
    const picker = useCategoryPicker();

    const [name, setName] = useState('');
    const [category, setCategory] = useState<ExpenseCategory>('COFFEE');
    const [chosenPayer, setPayer] = useState<VaultPayerSource>('VAULT');
    // Derived, not forced into state: the amount can change between presents, and a group that
    // can cover the new amount should get the member's earlier choice back.
    const payer: VaultPayerSource = groupCanCover ? chosenPayer : 'PERSONAL';
    const [isSharedWithAll, setIsSharedWithAll] = useState(true);
    const [shareWithUserIds, setShareWithUserIds] = useState<Set<number>>(new Set());

    useImperativeHandle(ref, () => ({
      present: () => sheetRef.current?.present(),
      dismiss: () => sheetRef.current?.dismiss(),
    }));

    const acceptedMembers = members.filter((m) => m.inviteStatus === 'ACCEPTED');

    const toggleShare = (userId: number) => {
      setShareWithUserIds((current) => {
        const next = new Set(current);
        if (next.has(userId)) next.delete(userId);
        else next.add(userId);
        // Deselecting the last member would mean nobody shares the expense, which is not a state
        // the ledger can represent — fall back to "All".
        if (next.size === 0) {
          setIsSharedWithAll(true);
          return next;
        }
        setIsSharedWithAll(false);
        return next;
      });
    };

    const handleDone = () => {
      const typed = name.trim();
      const resolvedName = typed !== '' ? typed : fallbackName || categoryOption(category).title;
      onDone({
        name: resolvedName,
        category,
        payer,
        shareWithUserIds: isSharedWithAll ? [] : Array.from(shareWithUserIds),
      });
    };

    return (
      <AppSheet ref={sheetRef} snapPoints={['56%']} onDismiss={onDismiss}>
        <View style={styles.container} testID="vault-expense-sheet">
          <Text style={styles.title}>{t('Add new expenses')}</Text>

          <View
            style={[styles.form, isWorking && styles.formLocked]}
            pointerEvents={isWorking ? 'none' : 'auto'}
          >
            <View style={styles.categoryAndName}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('Category, {{0}}', { 0: t(categoryOption(category).title) })}
                onPress={picker.open}
                testID="vault-expense-category-button"
                style={styles.categoryButton}
              >
                <CategoryIcon category={category} size={36} />
                <SFSymbol
                  name="chevron.down"
                  fallback="chevron-down"
                  size={11}
                  color={colors.contentM}
                />
              </Pressable>
              {/* gorhom's input: `AppSheet`'s keyboardBehavior="interactive" only lifts the sheet
                above the keyboard for a BottomSheetTextInput — a plain TextInput hid Done. */}
              <BottomSheetTextInput
                value={name}
                onChangeText={setName}
                placeholder={t('Transaction name')}
                placeholderTextColor={colors.contentL}
                style={styles.nameInput}
                testID="vault-expense-name"
              />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>{t('Paid by')}</Text>
              <View style={styles.chipRow}>
                <MemberPickerChip
                  label={t('Group')}
                  selected={payer === 'VAULT'}
                  accent="orange"
                  onPress={() => setPayer('VAULT')}
                  disabled={!groupCanCover}
                  testID="vault-expense-payer-group"
                />
                <MemberPickerChip
                  avatarUrl={currentUser?.avatarUrl}
                  label={currentUser?.displayName ?? t('Me')}
                  selected={payer === 'PERSONAL'}
                  accent="orange"
                  onPress={() => setPayer('PERSONAL')}
                  testID="vault-expense-payer-me"
                />
              </View>
              {!groupCanCover ? (
                <Text style={styles.groupShortNote} testID="vault-expense-group-short">
                  {t('Group wallet is low on funds')}
                </Text>
              ) : null}
              {payer === 'PERSONAL' && personalBalanceUsdc !== undefined ? (
                <Text style={styles.walletHint}>
                  {t('My wallet: {{0}}', { 0: `$${personalBalanceUsdc.toFixed(2)}` })}
                </Text>
              ) : null}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>{t('Share with')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.chipRow}>
                  <MemberPickerChip
                    label={t('All')}
                    selected={isSharedWithAll}
                    accent="blue"
                    onPress={() => {
                      setIsSharedWithAll(true);
                      setShareWithUserIds(new Set());
                    }}
                    testID="vault-expense-share-all"
                  />
                  {acceptedMembers.map((member) => (
                    <MemberPickerChip
                      key={member.id}
                      member={member}
                      selected={!isSharedWithAll && shareWithUserIds.has(member.userId)}
                      accent="blue"
                      onPress={() => toggleShare(member.userId)}
                      testID={`vault-expense-share-${member.userId}`}
                    />
                  ))}
                </View>
              </ScrollView>
            </View>
          </View>

          {/* Progress lives in the button (spinner + "Paying…") at full strength; only the form
              above dims and locks, so the sheet never gets a grey scrim over it. */}
          <Button
            title={isWorking ? t('Paying…') : t('Done')}
            icon={
              isWorking ? (
                <ActivityIndicator color={colors.white} testID="vault-expense-working" />
              ) : undefined
            }
            onPress={handleDone}
            disabled={isWorking}
            testID="vault-expense-done"
            style={[styles.done, isWorking && styles.doneWorking]}
          />
        </View>

        <CategoryPickerSheet ref={picker.ref} value={category} onSelect={setCategory} />
      </AppSheet>
    );
  },
);

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.lg },
  title: {
    ...beVietnamPro(18),
    letterSpacing: -0.36,
    color: colors.contentB,
    textAlign: 'center',
  },
  categoryAndName: { flexDirection: 'row', gap: spacing.sm },
  categoryButton: {
    width: 92,
    height: 59,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: colors.background,
    borderRadius: 16,
  },
  nameInput: {
    flex: 1,
    ...beVietnamPro(16),
    color: colors.contentB,
    minHeight: 59,
    borderRadius: 16,
    backgroundColor: colors.background,
    paddingHorizontal: 20,
  },
  section: { gap: 10 },
  sectionLabel: { ...beVietnamPro(14), color: colors.contentM },
  chipRow: { flexDirection: 'row', gap: 14, paddingVertical: 4 },
  walletHint: { ...beVietnamPro(13), color: colors.contentM },
  groupShortNote: { ...beVietnamPro(13), color: colors.secondary },
  form: { gap: spacing.lg },
  formLocked: { opacity: 0.4 },
  done: { backgroundColor: colors.blueBase },
  // Button dims itself when disabled; while paying it is the progress indicator, so keep it solid.
  doneWorking: { opacity: 1 },
});
