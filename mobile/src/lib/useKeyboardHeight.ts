import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * Current software-keyboard height (0 when hidden). iOS listens to the `Will` events so layout
 * moves with the keyboard animation; Android only emits `Did`.
 *
 * Used to lift floating (`detached`) gorhom sheets: their `keyboardBehavior="interactive"`
 * offset leaves them behind the keyboard.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const show = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hide = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const subs = [
      Keyboard.addListener(show, (e) => setHeight(e.endCoordinates.height)),
      Keyboard.addListener(hide, () => setHeight(0)),
    ];
    return () => subs.forEach((s) => s.remove());
  }, []);
  return height;
}
