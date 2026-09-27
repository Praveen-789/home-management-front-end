import { useRef, useState } from 'react';
import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import type { Photo } from '@/api/images';

type Props = { photos: Photo[]; onOpen: (photo: Photo) => void };

export default function PostPhotos({ photos, onOpen }: Props) {
  const { colors } = useTheme();
  const pager = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  const first = photos[0];
  if (!first) return null;
  const ratio = first.width > 0 && first.height > 0 ? first.width / first.height : 1;
  const aspectRatio = Math.max(0.8, Math.min(ratio, 16 / 9));
  const multiple = photos.length > 1;

  return (
    <View style={styles.container}>
      <View style={[styles.frame, { aspectRatio, backgroundColor: colors.surfaceVariant }]}
        onLayout={({ nativeEvent }) => {
          const nextWidth = nativeEvent.layout.width;
          if (nextWidth !== width) { setWidth(nextWidth); setPage(0); pager.current?.scrollTo({ x: 0, animated: false }); }
        }}>
        {width > 0 && <ScrollView ref={pager} horizontal pagingEnabled directionalLockEnabled
          showsHorizontalScrollIndicator={false} scrollEnabled={multiple}
          onScroll={({ nativeEvent }) => setPage(Math.max(0, Math.min(photos.length - 1, Math.round(nativeEvent.contentOffset.x / width))))}
          scrollEventThrottle={32}>
          {photos.map((photo, index) => (
            <Pressable key={photo.id} onPress={() => onOpen(photo)}
              accessibilityRole="imagebutton" accessibilityLabel={`Photo ${index + 1} of ${photos.length}`}
              accessibilityHint="Opens full-screen photo"
              style={{ width, height: width / aspectRatio }}>
              <Image source={{ uri: photo.url }} style={StyleSheet.absoluteFill} contentFit="contain"
                transition={150} cachePolicy="memory-disk" />
            </Pressable>
          ))}
        </ScrollView>}
        {multiple && <View pointerEvents="none" style={styles.badge}>
          <Text variant="labelSmall" style={styles.badgeText}>{page + 1} / {photos.length}</Text>
        </View>}
      </View>
      {multiple && <View style={styles.dots}>
        {photos.map((photo, index) => <Pressable key={photo.id}
          accessibilityRole="button" accessibilityLabel={`Show photo ${index + 1} of ${photos.length}`}
          accessibilityState={{ selected: page === index }}
          onPress={() => pager.current?.scrollTo({ x: index * width, animated: true })}
          style={styles.dotTarget}>
          <View style={[styles.dot, { backgroundColor: page === index ? colors.primary : colors.outlineVariant, width: page === index ? 16 : 6 }]} />
        </Pressable>)}
      </View>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 2 },
  frame: { width: '100%', borderRadius: 12, overflow: 'hidden' },
  badge: { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { color: '#fff' },
  dots: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap' },
  dotTarget: { minWidth: 32, minHeight: 32, alignItems: 'center', justifyContent: 'center' },
  dot: { height: 6, borderRadius: 3 },
});
