// DateField has one version per platform (date-field.android.tsx, date-field.web.tsx, and date-field.tsx
// for iOS). Metro picks the file by its suffix; this shared type keeps all three to the same contract.
export type DateFieldProps = {
  // Names the field for screen readers, e.g. "Due date".
  label: string;
  value: Date | null;
  // Null arrives only on web, where the browser's date input has its own clear button.
  onChange: (date: Date | null) => void;
  // Shown while no date is chosen.
  placeholder: string;
  disabled?: boolean;
};
