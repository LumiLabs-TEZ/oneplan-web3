/** Local visual fixture. Protected by the existing non-production route guard. */
import { ReceiptIcon } from '@/features/receipt/components/ReceiptIcon';
import { useAssets } from 'expo-asset';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createAssignmentState, assignmentReducer } from '@/features/receipt/assignment';
import { ReceiptAssignment } from '@/features/receipt/components/ReceiptAssignment';
import { ReceiptProgress } from '@/features/receipt/components/ReceiptProgress';
import fixture from '@/features/receipt/fixtures/receipt.json';
import { CURRENCIES } from '@/lib/currency';
import { ReceiptCamera } from '@/native/camera/ReceiptCamera';
import { colors } from '@/ui/theme';
function initialState(mode: string) {
  let id = 0;
  const state = createAssignmentState(
    fixture.receipt,
    fixture.members.map((m) => ({
      id: m.userId,
      userId: m.userId,
      displayName: m.name,
      isPro: false,
      inviteStatus: 'ACCEPTED',
      role: 'MEMBER',
    })),
    CURRENCIES.THB,
    () => `item-${++id}`,
  );
  state.members = fixture.members;
  if (mode === 'assigned' || mode === 'exhausted') {
    const event = {
      type: 'assign' as const,
      itemId: state.items[0]!.id,
      memberIds: [state.members[0]!.id],
    };
    const assigned = assignmentReducer(state, event);
    return mode === 'exhausted' ? assignmentReducer(assigned, event) : assigned;
  }
  return state;
}
export default function ReceiptFixture() {
  const [images] = useAssets([require('../../features/receipt/fixtures/receipt-reference.png')]);
  const { mode = 'assignment' } = useLocalSearchParams<{ mode?: string }>();
  useEffect(() => {
    if (mode !== 'error') return;
    const timer = setTimeout(
      () =>
        Alert.alert('Error', 'No items detected in the receipt.', [{ text: 'Retake' }], {
          cancelable: false,
        }),
      300,
    );
    return () => clearTimeout(timer);
  }, [mode]);
  const [name, setName] = useState(fixture.receipt.restaurantName);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {mode === 'capture' ? (
        <>
          <View style={{ height: 54, paddingHorizontal: 16, paddingBottom: 10 }}>
            <Pressable
              style={{
                width: 44,
                height: 44,
                justifyContent: 'center',
                alignItems: 'center',
                borderRadius: 22,
                backgroundColor: '#FFFFFFE6',
                boxShadow: '0px 8px 28px rgba(0,0,0,0.06)',
              }}
            >
              <ReceiptIcon name="back" size={14} color={colors.contentB} />
            </Pressable>
          </View>
          <ReceiptCamera
            active={false}
            onPhoto={() => {}}
            onError={() => {}}
            canCapture={() => false}
          />
        </>
      ) : mode === 'saving' || mode === 'parsing' || mode === 'error' ? (
        mode === 'saving' || images?.[0]?.localUri ? (
          <ReceiptProgress photoUri={mode !== 'saving' ? images![0]!.localUri! : undefined} />
        ) : (
          <View />
        )
      ) : (
        <ReceiptAssignment
          key={mode}
          initialState={initialState(mode)}
          currency={CURRENCIES.THB}
          restaurantName={name}
          onNameChange={setName}
          onBack={() => {}}
          onConfirm={() => {}}
        />
      )}
    </SafeAreaView>
  );
}
