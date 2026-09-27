import { Image } from 'expo-image';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { IconButton, Text } from 'react-native-paper';
import { largePictureUrl } from '@/lib/images';

type Props = {
  // The small picture that was tapped, or null to keep the viewer closed. A larger version of the
  // same file is what gets shown.
  url: string | null;
  // Whose picture it is, shown above it and read out by a screen reader.
  name: string;
  onClose: () => void;
};

const MAX_SIDE = 420;

// A closer look at a person's or a household's picture. It is React Native's own Modal, not a
// Paper one, so it also opens above a dialog or a menu, as the photo viewer does. A tap anywhere
// outside the picture closes it, and so does Android's back button.
export default function PictureViewer({ url, name, onClose }: Props) {
  const { width, height } = useWindowDimensions();
  const side = Math.min(width - 48, height - 200, MAX_SIDE);

  return (
    <Modal visible={!!url} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close picture" accessibilityRole="button">
        {/* Taps on the card itself stay here, so only the dark area around it closes the viewer. */}
        <Pressable style={[styles.card, { width: side }]} onPress={() => {}} accessible={false}>
          <View style={styles.bar}>
            <Text variant="titleMedium" numberOfLines={1} style={styles.name}>{name}</Text>
            <IconButton icon="close" iconColor="#fff" size={22} accessibilityLabel="Close picture" onPress={onClose} />
          </View>
          {url && (
            <Image
              source={{ uri: largePictureUrl(url) }}
              // The small copy is already in the cache, so it shows at once while the large one loads.
              placeholder={{ uri: url }}
              placeholderContentFit="cover"
              style={{ width: side, height: side }}
              contentFit="cover"
              transition={150}
              cachePolicy="memory-disk"
              accessibilityLabel={`Picture of ${name}`}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: 20, overflow: 'hidden', backgroundColor: '#111' },
  bar: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16 },
  name: { flex: 1, color: '#fff' },
});
