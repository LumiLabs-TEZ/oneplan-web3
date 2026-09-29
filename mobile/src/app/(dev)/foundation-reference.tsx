import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import OnboardingScreen from '@/app/onboarding';
import fixture from '@/features/foundation/fixtures/overview.json';
import { FreeTrialContent } from '@/features/subscription/components/FreeTrialContent';
import { CompassPill } from '@/features/location/components/CompassPill';
import { PlanImageStrip } from '@/features/plan/components/PlanImageStrip';
import { NoteCardRow } from '@/features/note/components/NoteCardRow';
import { SwipeToRemoveNote } from '@/features/note/components/SwipeToRemoveNote';
import { currentLanguage, setAppLanguage } from '@/i18n';
import { StyledQRCode } from '@/ui/components/StyledQRCode';
import { colors } from '@/ui/theme';

/** Production components, deterministic local state, no queries or mutations. */
export default function FoundationReference() {
  const { surface = 'onboarding', language = 'en', run = '0' } = useLocalSearchParams<{
    surface?: string;
    language?: string;
    run?: string;
  }>();
  const [notes, setNotes] = useState(fixture.notes);
  useEffect(() => {
    const previous = currentLanguage();
    setAppLanguage(language === 'vi' ? 'vi' : 'en');
    return () => setAppLanguage(previous);
  }, [language]);
  if (surface === 'trial')
    return (
      <FreeTrialContent
        product={{ displayPrice: '$2.99' }}
        remaining={{ hrs: 0, min: 42, sec: 17 }}
        purchasing={false}
        start={() => undefined}
        close={() => undefined}
      />
    );
  if (surface === 'onboarding') return <OnboardingScreen key={`${language}:${run}`} onComplete={() => undefined} />;
  return (
    <SafeAreaView
      style={[
        styles.root,
        { backgroundColor: surface === 'qr' ? colors.white : colors.background },
      ]}
    >
      {surface === 'compass' ? (
        <CompassPill
          userCoords={{ latitude: 0, longitude: 0 }}
          place={{ latitude: 0.02, longitude: 0 }}
          deviceHeading={-45}
          onPress={() => undefined}
        />
      ) : surface === 'photos' ? (
        <View style={{ alignSelf: 'stretch', padding: 16 }}>
          <PlanImageStrip
            images={[
              Image.resolveAssetSource(
                require('../../../assets/images/subscription/freeTrialScooter.png'),
              ).uri,
              Image.resolveAssetSource(require('../../../assets/images/missions/rewardBolt.png'))
                .uri,
              Image.resolveAssetSource(require('../../../assets/images/missions/rewardPro30d.png'))
                .uri,
            ]}
            testID="fixture-photos"
          />
        </View>
      ) : surface === 'qr' ? (
        <StyledQRCode value={fixture.qr.content} size={fixture.qr.size} color={colors.blueBase} />
      ) : (
        <View style={styles.notes}>
          {notes.map((note, index) => (
            <SwipeToRemoveNote
              key={note.id}
              index={index}
              onRemove={() => {
                setNotes((current) => current.filter((value) => value.id !== note.id));
                return true;
              }}
            >
              <NoteCardRow
                note={{ ...note, tripId: 1, createdById: 1, updatedAt: note.createdAt }}
                onEditPress={() => undefined}
                onToggle={() =>
                  setNotes((current) =>
                    current.map((value) =>
                      value.id === note.id ? { ...value, isDone: !value.isDone } : value,
                    ),
                  )
                }
                testID={`note-card-${index}`}
                checkboxTestID={`note-checkbox-${index}`}
              />
            </SwipeToRemoveNote>
          ))}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  notes: {
    margin: 10,
    padding: 8,
    gap: 8,
    borderRadius: 32,
    backgroundColor: colors.white,
    alignSelf: 'stretch',
  },
});
