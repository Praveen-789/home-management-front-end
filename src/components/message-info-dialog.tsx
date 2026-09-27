import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Dialog, HelperText, Icon, List, Portal, Text, useTheme } from 'react-native-paper';
import { getMessageReceipts, type Message, type MessageReceipt, type Receipt } from '@/api/chat';
import UserAvatar from '@/components/user-avatar';
import { messageSummary, receiptLine } from '@/lib/chat-helpers';
import { errorMessage } from '@/lib/errors';
import { useAuthStore } from '@/stores/auth-store';

type Props = {
  conversationId: string;
  // The user's own message to explain, or null while the dialog is closed.
  message: Message | null;
  // Everyone else's progress, from the store. When it changes while the dialog is open, someone has
  // just received or read something, so the list is fetched again.
  receipts: Receipt[] | undefined;
  onDismiss: () => void;
};

type Loaded = { key: string; messageId: string; people?: MessageReceipt[]; error?: string };

// "Message info": who one of your messages has reached, who has read it, and when. The ticks on a
// bubble only say "everyone" or "not everyone yet". This names the people, and it is fetched only
// when someone asks, so a household chat never carries per-message data around.
export default function MessageInfoDialog({ conversationId, message, receipts, onDismiss }: Props) {
  const { colors } = useTheme();
  const token = useAuthStore(state => state.session?.token);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const messageId = message?.id;
  // Identifies one fetch. An answer is shown only while its key is still the current one, so a
  // slow answer for another message or an older state never replaces a newer one.
  const key = `${messageId}:${attempt}:${receipts?.map(r => `${r.userId}-${r.deliveredSequence}-${r.readSequence}`).join()}`;

  useEffect(() => {
    if (!messageId || !token) return;
    let alive = true;
    getMessageReceipts(token, conversationId, messageId)
      .then(people => { if (alive) setLoaded({ key, messageId, people }); })
      .catch((error: unknown) => { if (alive) setLoaded({ key, messageId, error: errorMessage(error, 'Could not load who has read this message.') }); });
    return () => { alive = false; };
  }, [conversationId, messageId, token, key]);

  // The last good list stays on screen while a refresh is in flight, so a new tick does not blink.
  // A list that belongs to another message is never shown.
  const people = loaded && loaded.messageId === messageId ? loaded.people : undefined;
  const failed = loaded?.key === key ? loaded.error : undefined;

  return (
    <Portal>
      <Dialog visible={!!message} onDismiss={onDismiss} style={styles.dialog}>
        <Dialog.Title>Message info</Dialog.Title>
        <Dialog.Content>
          <Text variant="bodyMedium" numberOfLines={3} style={[styles.quote, { backgroundColor: colors.primaryContainer, color: colors.onPrimaryContainer }]}>{message && messageSummary(message)}</Text>
        </Dialog.Content>
        <Dialog.ScrollArea style={styles.people}>
          <ScrollView>
            {failed ? (
              <View>
                <HelperText type="error">{failed}</HelperText>
                <Button onPress={() => setAttempt(value => value + 1)}>Try again</Button>
              </View>
            ) : !people ? (
              <ActivityIndicator style={styles.loading} accessibilityLabel="Loading who has read this message" />
            ) : people.length === 0 ? (
              <Text style={styles.loading}>Nobody else is in this chat yet.</Text>
            ) : people.map(person => (
              <List.Item
                key={person.user.id}
                title={person.user.name}
                description={receiptLine(person)}
                left={() => <UserAvatar name={person.user.name} url={person.user.avatarUrl} size={40} preview />}
                right={() => (
                  <View style={styles.tick}>
                    {person.delivered
                      ? <Icon source="check-all" size={20} color={person.read ? colors.primary : colors.onSurfaceVariant} />
                      : <Icon source="clock-outline" size={18} color={colors.onSurfaceVariant} />}
                  </View>
                )}
              />
            ))}
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions><Button onPress={onDismiss}>Close</Button></Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  dialog: { maxWidth: 520, width: '90%', alignSelf: 'center', maxHeight: '80%' },
  quote: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  people: { paddingHorizontal: 12, maxHeight: 360 },
  loading: { padding: 24, textAlign: 'center' },
  tick: { justifyContent: 'center', paddingRight: 4 },
});
