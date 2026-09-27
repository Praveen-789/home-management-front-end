import { useState } from 'react';
import { Image } from 'expo-image';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { Avatar, useTheme } from 'react-native-paper';
import PictureViewer from '@/components/picture-viewer';
import { fonts } from '@/constants/fonts';
import { initials } from '@/lib/images';

type Props = {
  name: string;
  // The person's picture. Without one, or when it cannot be loaded, their initials are shown.
  url?: string | null;
  size: number;
  style?: StyleProp<ViewStyle>;
  // Lets a tap open the picture in a viewer. Initials have nothing to open, so they stay plain.
  preview?: boolean;
};

// A person's round picture, wherever a person appears in the app.
export default function UserAvatar({ name, url, size, style, preview = false }: Props) {
  const { colors } = useTheme();
  // Remembering which URL failed, not just that one did, lets a new picture try again by itself.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [viewing, setViewing] = useState(false);

  if (!url || failedUrl === url) {
    return (
      <Avatar.Text
        size={size}
        label={initials(name)}
        color={colors.onPrimaryContainer}
        style={[{ backgroundColor: colors.primaryContainer }, style]}
        labelStyle={{ fontFamily: fonts.semiBold }}
      />
    );
  }
  const shape = { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surfaceVariant };
  const picture = (
    <Image
      source={{ uri: url }}
      // The name is announced by the row the avatar sits in, so the picture itself stays silent.
      accessible={false}
      style={[shape, !preview && (style as object)]}
      contentFit="cover"
      transition={150}
      cachePolicy="memory-disk"
      onError={() => setFailedUrl(url)}
    />
  );
  if (!preview) return picture;
  // The caller's style carries the spacing, so it moves to the pressable that now wraps the image.
  return (
    <>
      <Pressable
        onPress={() => setViewing(true)}
        hitSlop={6}
        accessibilityRole="imagebutton"
        accessibilityLabel={`View ${name}'s picture`}
        style={({ pressed }) => [style, pressed && { opacity: 0.7 }]}>
        {picture}
      </Pressable>
      <PictureViewer url={viewing ? url : null} name={name} onClose={() => setViewing(false)} />
    </>
  );
}
