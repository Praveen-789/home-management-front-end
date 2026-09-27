import { useRef, useState, type PropsWithChildren } from 'react';
import { KeyboardAvoidingView, StyleSheet, View } from 'react-native';

// The body of a screen with an input pinned to the bottom, such as a chat or comment box, which
// keeps that input above the keyboard. Edge-to-edge Android no longer resizes the window for the
// keyboard, so padding does it on both platforms. The keyboard's position is given from the top of
// the screen but the view's own from its parent, so the offset is where this body starts on screen.
export default function KeyboardAvoidingBody({ children }: PropsWithChildren) {
  const body = useRef<View>(null);
  const [top, setTop] = useState(0);
  // Android removes views that only group their children, and a removed view cannot be measured.
  return (
    <View ref={body} collapsable={false} style={styles.flex} onLayout={() => body.current?.measureInWindow((_x, y) => setTop(y))}>
      <KeyboardAvoidingView style={styles.flex} behavior="padding" keyboardVerticalOffset={top}>
        {children}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
