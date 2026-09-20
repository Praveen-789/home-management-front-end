import { useTheme } from 'react-native-paper';
import type { DateFieldProps } from '@/components/date-field.types';
import { fonts } from '@/constants/fonts';
import { parseDateInput, toDateInput } from '@/lib/task-helpers';

// Web: the browser's own date input. It brings a calendar popup, keyboard entry and a clear button,
// and only ever reports a valid YYYY-MM-DD or an empty string. It shows its own hint while empty,
// so the placeholder is not used here.
export default function DateField({ label, value, onChange, disabled }: DateFieldProps) {
  const { colors, dark, roundness } = useTheme();

  return (
    <input
      type="date"
      aria-label={label}
      value={value ? toDateInput(value) : ''}
      disabled={disabled}
      onChange={(event) => onChange(parseDateInput(event.target.value) ?? null)}
      style={{
        height: 40,
        padding: '0 16px',
        borderRadius: roundness,
        border: `1px solid ${colors.outline}`,
        backgroundColor: 'transparent',
        color: colors.onSurface,
        fontFamily: fonts.medium,
        fontSize: 14,
        // Tells the browser which palette to draw its calendar icon and popup in.
        colorScheme: dark ? 'dark' : 'light',
        opacity: disabled ? 0.5 : 1,
      }}
    />
  );
}
