/**
 * FAB quick-action rows (`MainView.expandedContent`). Glass-less: the JS `MorphingTabBar` card
 * the rows morph out of supplies the material.
 */
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useIsPro } from '@/features/me/useMe';
import { QUICK_ACTIONS } from '@/features/shell/quickActions';
import { useQuickActionHandler } from '@/features/shell/useQuickActionHandler';
import { PremiumGate } from '@/features/subscription/components/PremiumGate';
import { useAppLanguage } from '@/i18n';
import { ProBadge } from '@/ui/components/ProBadge';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export function QuickActionsMenu({
  onClose,
  planningTripCount = 0,
}: {
  onClose: () => void;
  planningTripCount?: number;
}) {
  useAppLanguage();
  const { t } = useTranslation();
  const isPro = useIsPro();
  const handle = useQuickActionHandler({ onClose, planningTripCount });

  return (
    <View style={styles.inner}>
      {QUICK_ACTIONS.map((action) => {
        const row = (
          <Pressable
            accessibilityRole="button"
            testID={`quick-${action.id}`}
            onPress={() => handle(action.id)}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            <Ionicons name={action.icon} size={20} color={colors.contentB} style={styles.icon} />
            <Text style={styles.title}>{t(action.title)}</Text>
            {action.proOnly ? (
              <ProBadge testID={`quick-${action.id}-badge`} style={styles.badge} />
            ) : null}
          </Pressable>
        );

        if (!action.proOnly) return <View key={action.id}>{row}</View>;

        return (
          // `onBlockedPress` closes the FAB first — otherwise the expanded menu stays open
          // behind the pushed paywall and is still there when it is dismissed.
          <PremiumGate
            key={action.id}
            allowed={isPro}
            dimsWhenBlocked={false}
            onBlockedPress={onClose}
          >
            {row}
          </PremiumGate>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  inner: { padding: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 999,
  },
  rowPressed: { backgroundColor: 'rgba(128,128,128,0.06)' },
  icon: { width: 28, textAlign: 'center' },
  title: { ...beVietnamPro(16, 'medium'), color: colors.contentB, flex: 1 },
  badge: { flexShrink: 0 },
});
