import { Appbar } from 'react-native-paper';
import { useHeaderColors } from '@/hooks/use-header-colors';

type Props = { icon: string; accessibilityLabel: string; onPress: () => void; disabled?: boolean };

// An icon button for the app header, tinted to stay readable on the coloured bar.
export default function HeaderAction({ icon, accessibilityLabel, onPress, disabled = false }: Props) {
  const { foreground } = useHeaderColors();
  // Paper paints disabled icons dark grey and ignores the color prop, which is invisible on green.
  // So the disabled state is handled here: no press handler, faded, and announced as disabled.
  return (
    <Appbar.Action
      icon={icon}
      color={foreground}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      onPress={disabled ? undefined : onPress}
      style={disabled ? { opacity: 0.45 } : undefined}
    />
  );
}
