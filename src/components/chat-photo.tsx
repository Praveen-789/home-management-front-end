import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';
import { ActivityIndicator } from 'react-native-paper';
import { chatPhotoSize } from '@/lib/images';

type Props = {
  // A Cloudinary URL for a sent photo, or the local file while it is still on its way.
  uri: string;
  width?: number;
  height?: number;
  // Room the bubble leaves for the photo.
  maxWidth: number;
  // Shows a spinner over the photo while it uploads and sends.
  busy?: boolean;
  accessibilityLabel: string;
  onPress?: () => void;
  onLongPress?: () => void;
};

// A photo inside a chat bubble, in its own shape within sensible limits. A tap opens it, and a long
// press selects the message, as it does on the rest of the bubble.
export default function ChatPhoto({ uri, width, height, maxWidth, busy, accessibilityLabel, onPress, onLongPress }: Props) {
  const size = chatPhotoSize(width, height, maxWidth);
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      disabled={!onPress && !onLongPress}
      accessibilityRole="imagebutton"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ busy: !!busy }}
      style={({ pressed }) => [styles.frame, size, pressed && styles.pressed]}>
      {/* The list reuses rows, so the key makes a reused row start blank instead of flashing the previous photo. */}
      <Image source={{ uri }} recyclingKey={uri} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} cachePolicy="memory-disk" />
      {busy && <View style={[StyleSheet.absoluteFill, styles.busy]}><ActivityIndicator color="#fff" accessibilityLabel="Sending photo" /></View>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: 15, overflow: 'hidden', backgroundColor: 'rgba(127,127,127,0.2)' },
  pressed: { opacity: 0.85 },
  busy: { backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
});
