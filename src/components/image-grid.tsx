import { useState } from 'react';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Menu, Text, useTheme } from 'react-native-paper';
import type { Photo } from '@/api/images';
import { MAX_IMAGES } from '@/lib/images';
import type { ImageSource } from '@/lib/pick-image';

type Props = {
  images: Photo[];
  // Whether the caller may add and remove photos here. Decides whether the add tile appears.
  canManage: boolean;
  busy: boolean;
  onAdd: (source: ImageSource) => void;
  onOpen: (photo: Photo) => void;
};

const TILE = 96;

// Square thumbnails for a task or expense, with an add tile while there is room for more.
export default function ImageGrid({ images, canManage, busy, onAdd, onOpen }: Props) {
  const { colors, roundness } = useTheme();
  const [menu, setMenu] = useState(false);
  const canAdd = canManage && images.length < MAX_IMAGES;
  const tileStyle = { width: TILE, height: TILE, borderRadius: roundness * 2 };

  return (
    <View style={styles.section}>
      <Text variant="labelLarge">Photos ({images.length}/{MAX_IMAGES})</Text>
      {images.length === 0 && !canAdd && (
        <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant }}>No photos yet.</Text>
      )}
      <View style={styles.grid}>
        {images.map((photo, index) => (
          <Pressable
            key={photo.id}
            onPress={() => onOpen(photo)}
            disabled={busy}
            accessibilityRole="imagebutton"
            accessibilityLabel={`Photo ${index + 1} of ${images.length}, added by ${photo.uploadedBy.name}`}
            style={({ pressed }) => [tileStyle, styles.tile, pressed && styles.pressed]}>
            <Image source={{ uri: photo.thumbnailUrl }} style={tileStyle} contentFit="cover" transition={150} cachePolicy="memory-disk" />
          </Pressable>
        ))}
        {canAdd && (
          <Menu
            visible={menu}
            onDismiss={() => setMenu(false)}
            anchorPosition="bottom"
            anchor={
              <Pressable
                onPress={() => setMenu(true)}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Add photo"
                accessibilityState={{ disabled: busy, busy }}
                style={({ pressed }) => [tileStyle, styles.tile, styles.add, { borderColor: colors.outline }, pressed && styles.pressed]}>
                {busy ? (
                  <ActivityIndicator accessibilityLabel="Uploading photo" />
                ) : (
                  <>
                    <Text variant="headlineSmall" style={{ color: colors.primary }}>+</Text>
                    <Text variant="labelSmall" style={{ color: colors.onSurfaceVariant }}>Add photo</Text>
                  </>
                )}
              </Pressable>
            }>
            <Menu.Item leadingIcon="camera-outline" title="Take photo" onPress={() => { setMenu(false); onAdd('camera'); }} />
            <Menu.Item leadingIcon="image-multiple-outline" title="Choose from library" onPress={() => { setMenu(false); onAdd('library'); }} />
          </Menu>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { overflow: 'hidden' },
  add: { borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.7 },
});
