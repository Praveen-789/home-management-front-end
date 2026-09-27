import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Icon, Menu, useTheme } from 'react-native-paper';
import PictureViewer from '@/components/picture-viewer';
import type { ImageSource } from '@/lib/pick-image';

type Props = {
  // The avatar being edited. It is drawn as given, and this component adds the badge and the menu.
  children: ReactNode;
  // Read by screen readers, for example "Change your profile picture".
  label: string;
  // The current picture, if any. Decides whether the menu offers "View picture" and "Remove picture".
  pictureUrl?: string | null;
  // Whose picture it is, for the viewer's title.
  name: string;
  busy: boolean;
  onPick: (source: ImageSource) => void;
  onRemove: () => void;
};

// Makes an avatar tappable: a small camera badge shows it can be changed, and a tap offers the
// camera, the photo library, and removing the current picture. Used for a person and a household.
export default function PictureEditor({ children, label, pictureUrl, name, busy, onPick, onRemove }: Props) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState(false);
  const choose = (action: () => void) => { setOpen(false); action(); };

  return (
    <>
    <Menu
      visible={open}
      onDismiss={() => setOpen(false)}
      anchorPosition="bottom"
      anchor={
        <Pressable
          onPress={() => setOpen(true)}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ disabled: busy, busy }}
          style={({ pressed }) => [styles.anchor, pressed && styles.pressed]}>
          {children}
          <View style={[styles.badge, { backgroundColor: colors.primary, borderColor: colors.background }]}>
            {busy ? <ActivityIndicator size={14} color={colors.onPrimary} /> : <Icon source="camera" size={16} color={colors.onPrimary} />}
          </View>
        </Pressable>
      }>
      {!!pictureUrl && <Menu.Item leadingIcon="eye-outline" title="View picture" onPress={() => choose(() => setViewing(true))} />}
      <Menu.Item leadingIcon="camera-outline" title="Take photo" onPress={() => choose(() => onPick('camera'))} />
      <Menu.Item leadingIcon="image-multiple-outline" title="Choose from library" onPress={() => choose(() => onPick('library'))} />
      {!!pictureUrl && <Menu.Item leadingIcon="delete-outline" title="Remove picture" onPress={() => choose(onRemove)} />}
    </Menu>
    <PictureViewer url={viewing ? pictureUrl ?? null : null} name={name} onClose={() => setViewing(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  // Shrinks to the avatar, so the badge sits on its corner and not on the edge of the row.
  anchor: { alignSelf: 'flex-start' },
  badge: { position: 'absolute', right: -4, bottom: -4, width: 30, height: 30, borderRadius: 15, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.7 },
});
