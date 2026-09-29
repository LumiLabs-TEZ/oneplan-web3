// @privy-io/expo needs these polyfills loaded before anything else touches crypto/Buffer, per
// privy-io/expo-starter's entrypoint.js. Order matters — react-native-get-random-values before
// the ethersproject shims, both before Buffer is globalized.
import 'react-native-get-random-values';
import 'fast-text-encoding';
import '@ethersproject/shims';
import { Buffer } from 'buffer';

global.Buffer = Buffer;

// eslint-disable-next-line import/first -- must run after the polyfills above are applied
import 'expo-router/entry';
