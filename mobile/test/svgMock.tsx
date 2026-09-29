import React from 'react';
import { View } from 'react-native';

// Jest stand-in for react-native-svg-transformer: renders an empty View with the svg props.
export default function SvgMock(props: Record<string, unknown>) {
  return <View testID="svg" {...props} />;
}
