import { useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { Modal, StyleSheet, View } from 'react-native';
import { Button, IconButton, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Photo } from '@/api/images';
import { formatBytes } from '@/lib/images';

type Props = {
  // The photo to show, or null to keep the viewer closed.
  photo: Photo | null;
  canRemove: boolean;
  busy: boolean;
  onClose: () => void;
  onRemove: (photo: Photo) => void;
};

// A full-screen look at one photo. Deleting asks for a second tap inside the viewer, because a
// Paper dialog would open underneath this native modal.
export default function ImageViewer({ photo, canRemove, busy, onClose, onRemove }: Props) {
  const [confirming, setConfirming] = useState(false);
  useEffect(() => { setConfirming(false); }, [photo]);

  return (
    <Modal visible={!!photo} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <SafeAreaView style={styles.backdrop}>
        <View style={styles.bar}>
          <IconButton icon="close" iconColor="#fff" accessibilityLabel="Close photo" onPress={onClose} />
        </View>
        {photo && (
          <>
            <Image
              source={{ uri: photo.url }}
              style={styles.image}
              contentFit="contain"
              transition={200}
              cachePolicy="memory-disk"
              accessibilityLabel={`Photo added by ${photo.uploadedBy.name}`}
            />
            <View style={styles.footer}>
              <Text variant="bodySmall" style={styles.caption}>
                {`${photo.uploadedBy.name} · ${new Date(photo.createdAt).toLocaleDateString()} · ${photo.width}×${photo.height} · ${formatBytes(photo.bytes)}`}
              </Text>
              {canRemove && (
                confirming ? (
                  <View style={styles.actions}>
                    <Button mode="outlined" textColor="#fff" disabled={busy} onPress={() => setConfirming(false)}>Keep</Button>
                    <Button mode="contained" buttonColor="#b3261e" textColor="#fff" loading={busy} disabled={busy} onPress={() => onRemove(photo)}>Delete photo</Button>
                  </View>
                ) : (
                  <Button mode="outlined" icon="delete-outline" textColor="#fff" disabled={busy} onPress={() => setConfirming(true)}>Delete</Button>
                )
              )}
            </View>
          </>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000' },
  bar: { flexDirection: 'row', justifyContent: 'flex-end' },
  image: { flex: 1, width: '100%' },
  footer: { padding: 16, gap: 12, alignItems: 'center' },
  caption: { color: '#ddd', textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 12 },
});
