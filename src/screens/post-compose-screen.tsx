import { useState } from 'react';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, HelperText, IconButton, Menu, Text, TextInput, useTheme } from 'react-native-paper';
import type { ImageFile } from '@/api/images';
import AppShell, { goBack } from '@/components/app-shell';
import { fonts } from '@/constants/fonts';
import { errorMessage } from '@/lib/errors';
import { pickImage, type ImageSource } from '@/lib/pick-image';
import { canSubmitPost, MAX_POST_IMAGES, MAX_POST_TEXT } from '@/lib/post-permissions';
import { useHouseholdStore } from '@/stores/household-store';
import { usePostStore } from '@/stores/post-store';

const TILE = 96;

// Writing a new post: some words, up to five photos, or both. The photos upload when the post is
// shared, not when they are picked, so removing one costs nothing.
export default function PostComposeScreen() {
  const { colors, roundness } = useTheme();
  const { householdId = '' } = useLocalSearchParams<{ householdId?: string }>();
  const household = useHouseholdStore((state) => state.households?.find((row) => row.id === householdId));
  const [text, setText] = useState('');
  const [files, setFiles] = useState<ImageFile[]>([]);
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const tileStyle = { width: TILE, height: TILE, borderRadius: roundness * 2 };

  async function addPhoto(source: ImageSource) {
    setError('');
    try {
      const file = await pickImage(source);
      if (file) setFiles((current) => [...current, file]);
    } catch (error) { setError(errorMessage(error)); }
  }

  async function share() {
    setBusy(true);
    setError('');
    try {
      await usePostStore.getState().createPost(householdId, text.trim(), files);
      goBack();
    } catch (error) {
      setError(errorMessage(error, 'Could not share the post. Please try again.'));
      setBusy(false);
    }
  }

  return (
    <AppShell title="New post" back scroll>
      <Text variant="titleMedium" style={styles.heading}>Share something with {household?.name ?? 'your household'}</Text>
      <TextInput
        mode="outlined"
        placeholder="What's happening at home?"
        value={text}
        onChangeText={setText}
        multiline
        numberOfLines={6}
        maxLength={MAX_POST_TEXT}
        style={styles.input}
        disabled={busy}
        accessibilityLabel="Post text"
      />
      <View style={styles.section}>
        <Text variant="labelLarge">Photos ({files.length}/{MAX_POST_IMAGES})</Text>
        <View style={styles.grid}>
          {files.map((file, index) => (
            <View key={file.uri} style={[tileStyle, styles.tile]}>
              <Image source={{ uri: file.uri }} style={tileStyle} contentFit="cover" />
              <IconButton
                icon="close-circle"
                size={22}
                iconColor={colors.onPrimary}
                containerColor={colors.backdrop}
                style={styles.remove}
                disabled={busy}
                accessibilityLabel={`Remove photo ${index + 1}`}
                onPress={() => setFiles((current) => current.filter((row) => row !== file))}
              />
            </View>
          ))}
          {files.length < MAX_POST_IMAGES && (
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
                  style={({ pressed }) => [tileStyle, styles.add, { borderColor: colors.outline }, pressed && styles.pressed]}>
                  <Text variant="headlineSmall" style={{ color: colors.primary }}>+</Text>
                  <Text variant="labelSmall" style={{ color: colors.onSurfaceVariant }}>Add photo</Text>
                </Pressable>
              }>
              <Menu.Item leadingIcon="camera-outline" title="Take photo" onPress={() => { setMenu(false); void addPhoto('camera'); }} />
              <Menu.Item leadingIcon="image-multiple-outline" title="Choose from library" onPress={() => { setMenu(false); void addPhoto('library'); }} />
            </Menu>
          )}
        </View>
      </View>
      {!!error && <HelperText type="error">{error}</HelperText>}
      {busy && <ActivityIndicator accessibilityLabel="Sharing the post" />}
      <Button mode="contained" icon="send" disabled={busy || !household || !canSubmitPost(text, files.length)} onPress={() => void share()}>
        Share post
      </Button>
      <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>
        Everyone in the household will see your post and can like it and comment on it.
      </Text>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  heading: { fontFamily: fonts.semiBold },
  input: { minHeight: 140 },
  section: { gap: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { overflow: 'hidden' },
  remove: { position: 'absolute', top: -8, right: -8, margin: 0 },
  add: { borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.7 },
});
