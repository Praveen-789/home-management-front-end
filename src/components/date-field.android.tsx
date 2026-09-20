import { useState } from 'react';
import { DatePickerDialog, Host } from '@expo/ui/jetpack-compose';
import { Button, useTheme } from 'react-native-paper';
import type { DateFieldProps } from '@/components/date-field.types';
import { formatFullDate, localDayAsUtc, utcDayAsLocal } from '@/lib/task-helpers';

// Android: a button that opens the Material 3 calendar dialog.
export default function DateField({ label, value, onChange, placeholder, disabled }: DateFieldProps) {
  const { colors, dark } = useTheme();
  const [open, setOpen] = useState(false);
  const text = value ? formatFullDate(value) : placeholder;

  return (
    <>
      <Button mode="outlined" icon="calendar" disabled={disabled} accessibilityLabel={`${label}: ${text}`} onPress={() => setOpen(true)}>
        {text}
      </Button>
      {/* The dialog opens as it mounts and cannot close itself, so both outcomes unmount it.
          The Host follows the app's own light or dark choice, which can differ from the device's. */}
      {open && (
        <Host colorScheme={dark ? 'dark' : 'light'} seedColor={colors.primary}>
          <DatePickerDialog
            initialDate={localDayAsUtc(value ?? new Date()).toISOString()}
            onDateSelected={(picked) => { setOpen(false); onChange(utcDayAsLocal(picked)); }}
            onDismissRequest={() => setOpen(false)}
          />
        </Host>
      )}
    </>
  );
}
