import { useState } from 'react';
import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { Button, useTheme } from 'react-native-paper';
import type { DateFieldProps } from '@/components/date-field.types';
import { formatFullDate } from '@/lib/task-helpers';

// iOS: a button that unfolds the SwiftUI calendar beneath it. iOS has no date dialog, so the calendar
// sits in the page and folds away once a day is tapped. Android and web have their own files.
export default function DateField({ label, value, onChange, placeholder, disabled }: DateFieldProps) {
  const { colors, dark } = useTheme();
  const [open, setOpen] = useState(false);
  const text = value ? formatFullDate(value) : placeholder;

  return (
    <>
      <Button mode="outlined" icon="calendar" disabled={disabled} accessibilityLabel={`${label}: ${text}`} onPress={() => setOpen((current) => !current)}>
        {text}
      </Button>
      {open && (
        <DateTimePicker
          mode="date"
          display="inline"
          value={value ?? new Date()}
          accentColor={colors.primary}
          themeVariant={dark ? 'dark' : 'light'}
          onValueChange={(_event, picked) => { setOpen(false); onChange(picked); }}
        />
      )}
    </>
  );
}
