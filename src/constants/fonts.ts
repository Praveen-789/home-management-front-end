import { PlusJakartaSans_400Regular } from '@expo-google-fonts/plus-jakarta-sans/400Regular';
import { PlusJakartaSans_500Medium } from '@expo-google-fonts/plus-jakarta-sans/500Medium';
import { PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans/600SemiBold';
import { PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans/700Bold';
import { configureFonts, MD3LightTheme } from 'react-native-paper';

// Each weight is imported from its own path. Importing the package root would bundle all 14 files.
// The keys double as the family names that styles refer to.
export const fontAssets = {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
};

// On Android a custom font file is exactly one weight. Asking for fontWeight '700' on the regular
// file gives a smeared fake bold, so styles pick a weight by family name instead:
//   { fontFamily: fonts.bold }   not   { fontWeight: '700' }
export const fonts = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semiBold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
} as const;

// Material's defaults set big text in a thin regular weight, which added to the pale look.
// Here headings get semi-bold, labels and buttons get medium, and body text stays regular.
function familyFor(variant: string) {
  if (/^(display|headline|title)/.test(variant)) return fonts.semiBold;
  if (variant.startsWith('label')) return fonts.medium;
  return fonts.regular;
}

const variants = Object.keys(MD3LightTheme.fonts) as (keyof typeof MD3LightTheme.fonts)[];

export const paperFonts = configureFonts({
  config: Object.fromEntries(
    // fontWeight is reset to normal because the family name already carries the weight.
    variants.map((variant) => [variant, { fontFamily: familyFor(variant), fontWeight: 'normal' as const }]),
  ),
});
