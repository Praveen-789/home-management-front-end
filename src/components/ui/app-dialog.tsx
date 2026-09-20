import type { ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Button, Dialog, Icon, Portal, Text, useTheme } from 'react-native-paper';
import { fonts } from '@/constants/fonts';

type Props = {
  visible: boolean;
  onDismiss: () => void;
  icon: string;
  title: string;
  // Plain strings get the standard muted body style. Pass elements for anything richer, like a form.
  children: ReactNode;
  // 'danger' paints the badge and the confirm button red, for deletes and removals.
  tone?: 'default' | 'danger';
  confirmLabel?: string;
  onConfirm?: () => void;
  cancelLabel?: string;
  // What the cancel button does when that differs from dismissing, such as declining an invitation.
  // Tapping outside the dialog still only dismisses.
  onCancel?: () => void;
  busy?: boolean;
  // Long labels do not fit side by side on a phone, so they can stack instead.
  stacked?: boolean;
};

// HomeHub's one dialog look: icon badge, centered title, muted body, then a clear primary action.
// Every confirm and form dialog goes through here so they stay consistent.
export default function AppDialog({
  visible, onDismiss, icon, title, children, tone = 'default',
  confirmLabel, onConfirm, cancelLabel = 'Cancel', onCancel, busy = false, stacked = false,
}: Props) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const danger = tone === 'danger';
  // Phones keep Paper's side margins. Wider screens get a fixed, centered card instead of a stretched one.
  const wide = width > MAX_WIDTH + 52;
  const badgeColor = danger ? colors.errorContainer : colors.primaryContainer;
  const iconColor = danger ? colors.onErrorContainer : colors.onPrimaryContainer;

  const cancel = (
    <Button mode={stacked ? 'text' : 'outlined'} style={[styles.button, !stacked && styles.buttonInRow]} contentStyle={styles.buttonContent} disabled={busy} onPress={onCancel ?? onDismiss}>
      {cancelLabel}
    </Button>
  );
  const confirm = !!confirmLabel && (
    <Button
      mode="contained"
      style={[styles.button, !stacked && styles.buttonInRow]}
      contentStyle={styles.buttonContent}
      buttonColor={danger ? colors.error : undefined}
      textColor={danger ? colors.onError : undefined}
      loading={busy}
      disabled={busy}
      onPress={onConfirm}
    >
      {confirmLabel}
    </Button>
  );

  return (
    <Portal>
      <Dialog
        visible={visible}
        onDismiss={onDismiss}
        dismissable={!busy}
        style={[styles.dialog, wide && styles.dialogWide, { backgroundColor: colors.elevation.level3, borderColor: colors.outlineVariant }]}
      >
        <View style={styles.header}>
          <View style={[styles.badge, { backgroundColor: badgeColor }]}>
            <Icon source={icon} size={28} color={iconColor} />
          </View>
          <Text variant="titleLarge" style={[styles.title, { color: colors.onSurface }]} accessibilityRole="header">{title}</Text>
        </View>
        <Dialog.Content style={styles.content}>
          {typeof children === 'string'
            ? <Text variant="bodyMedium" style={[styles.body, { color: colors.onSurfaceVariant }]}>{children}</Text>
            : children}
        </Dialog.Content>
        {/* Stacked puts the primary action on top, where the thumb lands first. */}
        <View style={[styles.actions, stacked ? styles.actionsStacked : styles.actionsRow]}>
          {stacked ? <>{confirm}{cancel}</> : <>{cancel}{confirm}</>}
        </View>
      </Dialog>
    </Portal>
  );
}

// Shared body style for callers that pass their own elements.
export const dialogBodyStyle = { textAlign: 'center', lineHeight: 21 } as const;

const MAX_WIDTH = 420;

const styles = StyleSheet.create({
  // Paper multiplies theme roundness by 7 for dialogs, which turns 12 into a blob. Pin it instead.
  dialog: { borderRadius: 24, borderWidth: StyleSheet.hairlineWidth },
  dialogWide: { width: MAX_WIDTH, alignSelf: 'center' },
  header: { alignItems: 'center', paddingTop: 28, paddingHorizontal: 24, gap: 16 },
  badge: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  title: { textAlign: 'center', fontFamily: fonts.semiBold },
  content: { marginTop: 12, paddingBottom: 0 },
  body: dialogBodyStyle,
  actions: { padding: 24, gap: 12 },
  actionsRow: { flexDirection: 'row' },
  actionsStacked: { flexDirection: 'column' },
  button: { borderRadius: 14 },
  buttonInRow: { flex: 1 },
  buttonContent: { height: 46 },
});
