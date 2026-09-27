import { useState } from 'react';
import { Image } from 'expo-image';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon, useTheme } from 'react-native-paper';
import PictureViewer from '@/components/picture-viewer';

type Props = {
  // The household's picture. Without one, or when it cannot be loaded, a home icon is shown.
  url?: string | null;
  size: number;
  // Colours of the icon tile, so it suits the card it sits on.
  background?: string;
  foreground?: string;
  style?: StyleProp<ViewStyle>;
  // Lets a tap open the picture in a viewer, titled with the household's name. The home icon has
  // nothing to open, so it stays plain.
  preview?: boolean;
  name?: string;
};

// A household's picture as a rounded square, which tells it apart from a person's round avatar.
export default function HouseholdAvatar({ url, size, background, foreground, style, preview = false, name = 'Household' }: Props) {
  const { colors } = useTheme();
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [viewing, setViewing] = useState(false);
  const shape = { width: size, height: size, borderRadius: size * 0.34 };

  if (!url || failedUrl === url) {
    return (
      <View style={[shape, { backgroundColor: background ?? colors.primaryContainer, alignItems: 'center', justifyContent: 'center' }, style]}>
        <Icon source="home-heart" size={size * 0.56} color={foreground ?? colors.onPrimaryContainer} />
      </View>
    );
  }
  const picture = (
    <Image
      source={{ uri: url }}
      accessible={false}
      style={[shape, { backgroundColor: colors.surfaceVariant }, !preview && (style as object)]}
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
        accessibilityLabel={`View the picture of ${name}`}
        style={({ pressed }) => [{ alignSelf: 'flex-start' }, style, pressed && { opacity: 0.7 }]}>
        {picture}
      </Pressable>
      <PictureViewer url={viewing ? url : null} name={name} onClose={() => setViewing(false)} />
    </>
  );
}
