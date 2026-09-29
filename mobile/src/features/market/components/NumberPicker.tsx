import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useRef } from 'react';
import { AppSheet, type AppSheetRef } from '@/ui/components/AppSheet';
import { Button } from '@/ui/components';
export function NumberPicker({
  label,
  value,
  max,
  onSelect,
}: {
  label: string;
  value: number;
  max: number;
  onSelect: (value: number) => void;
}) {
  const sheet = useRef<AppSheetRef>(null);
  return (
    <>
      <Button
        title={`${label}: ${value}`}
        variant="secondary"
        onPress={() => sheet.current?.present()}
      />
      <AppSheet ref={sheet} snapPoints={['60%']}>
        <BottomSheetScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 20, gap: 8 }}
        >
          {Array.from({ length: max }, (_, index) => index + 1).map((number) => (
            <Button
              key={number}
              title={String(number)}
              variant={number === value ? 'dark' : 'secondary'}
              onPress={() => {
                onSelect(number);
                sheet.current?.dismiss();
              }}
            />
          ))}
        </BottomSheetScrollView>
      </AppSheet>
    </>
  );
}
