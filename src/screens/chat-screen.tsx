import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { AppState, BackHandler, FlatList, KeyboardAvoidingView, Pressable, StyleSheet, TextInput, View, type ViewToken } from 'react-native';
import { ActivityIndicator, Button, HelperText, Icon, IconButton, Snackbar, Text, useTheme } from 'react-native-paper';
import AppShell from '@/components/app-shell';
import AppDialog from '@/components/ui/app-dialog';
import HeaderAction from '@/components/header-action';
import StatusMessage from '@/components/status-message';
import { fonts } from '@/constants/fonts';
import { conversationName, deleteForEveryoneUntil, MAX_SELECTION, messageDay, messageTime, toggleSelection } from '@/lib/chat-helpers';
import { errorMessage } from '@/lib/errors';
import { useAuthStore } from '@/stores/auth-store';
import { useChatStore, type PendingMessage } from '@/stores/chat-store';
import { useHouseholdStore } from '@/stores/household-store';
import type { Message } from '@/api/chat';

const VIEWABILITY = { itemVisiblePercentThreshold: 60, minimumViewTime: 250 };
type Row = { kind: 'message'; key: string; message: Message } | { kind: 'pending'; key: string; pending: PendingMessage };
export default function ChatScreen() {
  const { conversationId = '' } = useLocalSearchParams<{ conversationId: string }>();
  const { colors } = useTheme();
  const userId = useAuthStore(s => s.session?.user.id) ?? '';
  const conversation = useChatStore(s => s.conversations[conversationId]);
  const thread = useChatStore(s => s.threads[conversationId]);
  const error = useChatStore(s => s.errors[conversationId]);
  const draft = useChatStore(s => s.drafts[conversationId] ?? '');
  const connected = useChatStore(s => s.connected);
  const household = useHouseholdStore(s => s.households?.find(h => h.id === conversation?.householdId));
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [muting, setMuting] = useState(false);
  const [notice, setNotice] = useState('');
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const [bodyTop, setBodyTop] = useState(0);
  // Long-pressing a message starts a selection; after that a tap adds or removes one.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteForEveryoneAvailable, setDeleteForEveryoneAvailable] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const body = useRef<View>(null);
  const list = useRef<FlatList<Row>>(null);
  const readable = useRef(0);
  const focused = useRef(false);
  const bottom = useRef(true);
  const olderLock = useRef(false);
  const viewingId = useRef(conversationId);

  useFocusEffect(useCallback(() => {
    if (viewingId.current !== conversationId) readable.current = 0;
    viewingId.current = conversationId;
    focused.current = true;
    const update = () => {
      useChatStore.setState({ activeId: AppState.currentState === 'active' ? conversationId : null });
      if (AppState.currentState === 'active') void useChatStore.getState().sync(conversationId).catch(() => {});
    };
    update();
    const app = AppState.addEventListener('change', update);
    // Only visible server-confirmed messages advance read state; drafts and background events do not.
    const timer = setInterval(() => {
      if (focused.current && AppState.currentState === 'active' && readable.current > 0) {
        void useChatStore.getState().read(conversationId, readable.current).catch(() => {});
      }
    }, 800);
    return () => {
      focused.current = false; clearInterval(timer); app.remove();
      // A selection does not follow the user to another screen or another chat.
      setSelectedIds([]); setConfirmingDelete(false);
      if (useChatStore.getState().activeId === conversationId) useChatStore.setState({ activeId: null });
    };
  }, [conversationId]));
  const onVisible = useCallback(({ viewableItems }: { viewableItems: ViewToken<Row>[] }) => {
    if (!focused.current || AppState.currentState !== 'active') return;
    for (const { item, isViewable } of viewableItems) {
      if (isViewable && item.kind === 'message' && item.message.conversationId === viewingId.current) readable.current = Math.max(readable.current, item.message.sequence);
    }
  }, []);
  const messages: Row[] = [
    ...(thread?.messages ?? []).map(message => ({ kind: 'message' as const, key: message.id, message })),
    ...(thread?.pending ?? []).map(pending => ({ kind: 'pending' as const, key: pending.clientMessageId, pending })),
  ].reverse();
  async function older() {
    if (olderLock.current) return;
    olderLock.current = true; setLoadingOlder(true);
    try { await useChatStore.getState().older(conversationId); }
    catch (e) { setNotice(errorMessage(e, 'Could not load earlier messages.')); }
    finally { olderLock.current = false; setLoadingOlder(false); }
  }
  async function mute() {
    if (!conversation || muting) return;
    setMuting(true);
    try { await useChatStore.getState().mute(conversationId, !conversation.muted); }
    catch (e) { setNotice(errorMessage(e)); }
    finally { setMuting(false); }
  }
  function latest() { bottom.current = true; setAwayFromBottom(false); list.current?.scrollToOffset({ offset: 0, animated: true }); }
  function send() {
    if (!draft.trim() || !conversation?.canSend) return;
    void useChatStore.getState().send(conversationId, draft);
    latest();
  }
  // The selection is read from the thread, so a message deleted on another device drops out of it.
  const selectedMessages = useMemo(() => (thread?.messages ?? []).filter(message => selectedIds.includes(message.id)), [thread?.messages, selectedIds]);
  const selecting = selectedMessages.length > 0;
  const everyoneUntil = deleteForEveryoneUntil(selectedMessages, userId);
  function toggleMessage(message: Message) {
    const next = toggleSelection(selectedMessages.map(item => item.id), message.id);
    if (next) setSelectedIds(next);
    else setNotice(`You can select up to ${MAX_SELECTION} messages.`);
  }
  async function removeSelected(scope: 'me' | 'everyone') {
    if (!selecting || deleting) return;
    setDeleting(true);
    try {
      await useChatStore.getState().deleteMessages(conversationId, selectedMessages.map(message => message.id), scope);
      setConfirmingDelete(false); setSelectedIds([]);
    } catch (e) {
      setNotice(errorMessage(e, selectedMessages.length > 1 ? 'Could not delete these messages.' : 'Could not delete this message.'));
    } finally { setDeleting(false); }
  }
  async function clearChat() {
    if (clearing) return;
    setClearing(true);
    try {
      await useChatStore.getState().clear(conversationId);
      setNotice('Chat cleared.');
    } catch (e) {
      setNotice(errorMessage(e, 'Could not clear this chat.'));
    } finally { setClearing(false); setConfirmingClear(false); }
  }
  // While messages are selected, Android's back button leaves the selection instead of the chat.
  // The newest listener runs first, so this one is asked before the navigator's own.
  useEffect(() => {
    if (!selecting) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { setSelectedIds([]); return true; });
    return () => subscription.remove();
  }, [selecting]);
  // "Delete for everyone" is withdrawn the moment the oldest selected message passes 15 minutes,
  // even while the dialog is open or the app was in the background.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      clearTimeout(timer);
      const remaining = everyoneUntil === null ? 0 : everyoneUntil - Date.now();
      setDeleteForEveryoneAvailable(remaining > 0);
      if (remaining > 0) timer = setTimeout(update, remaining);
    };
    timer = setTimeout(update, 0);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') update();
    });
    return () => { clearTimeout(timer); subscription.remove(); };
  }, [everyoneUntil]);
  // A selection takes over the header: a count, a close button and the delete action.
  const hasHistory = !!thread && (thread.messages.length > 0 || thread.hasOlder);
  return <AppShell title={selecting ? `${selectedMessages.length} selected` : conversation ? conversationName(conversation, userId) : 'Chat'} back
    onClose={selecting ? () => setSelectedIds([]) : undefined}
    actions={selecting ? <HeaderAction icon="delete-outline" accessibilityLabel="Delete selected messages" onPress={() => setConfirmingDelete(true)} /> :
      conversation ? <>
        <HeaderAction icon="delete-sweep-outline" accessibilityLabel="Clear chat" disabled={!hasHistory || clearing} onPress={() => setConfirmingClear(true)} />
        <HeaderAction icon={conversation.muted ? 'bell-off-outline' : 'bell-outline'} accessibilityLabel={conversation.muted ? 'Unmute chat notifications' : 'Mute chat notifications'}
          disabled={muting} onPress={() => void mute()} />
      </> : undefined}>
    {!thread || !conversation ? error ? <StatusMessage text={error} action="Try again" onAction={() => void useChatStore.getState().sync(conversationId).catch(() => {})} /> :
      <ActivityIndicator style={styles.center} accessibilityLabel="Loading conversation" /> :
      // Edge-to-edge Android no longer resizes the window for the keyboard, so padding does it on both platforms.
      // The keyboard's position is given from the top of the screen, so the offset is where this body starts.
      <KeyboardAvoidingView style={styles.flex} behavior="padding" keyboardVerticalOffset={bodyTop}>
        <View ref={body} collapsable={false} onLayout={() => body.current?.measureInWindow((_x, y) => setBodyTop(y))}
          style={[styles.context, { borderColor: colors.outlineVariant }]}>
          <Icon source={conversation.type === 'HOUSEHOLD' ? 'account-group-outline' : 'lock-outline'} size={17} color={colors.primary} />
          <Text variant="labelMedium" style={{ color: colors.onSurfaceVariant, flex: 1 }}>
            {household?.name ? household.name + ' · ' : ''}{conversation.type === 'HOUSEHOLD' ? 'Everyone at home' : 'One-to-one chat'}{conversation.muted ? ' · Muted' : ''}
          </Text>
          {!connected && <Text variant="labelSmall" style={{ color: colors.onSurfaceVariant }}>Reconnecting…</Text>}
        </View>
        {!!error && <View style={styles.error}><HelperText type="error" style={styles.flex}>{error}</HelperText><Button compact onPress={() => void useChatStore.getState().sync(conversationId).catch(() => {})}>Retry</Button></View>}
        <FlatList ref={list} data={messages} extraData={selectedIds} inverted keyExtractor={r => r.key} style={styles.flex}
          contentContainerStyle={[styles.messages, !messages.length && styles.empty]}
          keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          viewabilityConfig={VIEWABILITY} onViewableItemsChanged={onVisible}
          onScroll={e => { const away = e.nativeEvent.contentOffset.y > 100; bottom.current = !away; setAwayFromBottom(away); }} scrollEventThrottle={100}
          onContentSizeChange={() => { if (bottom.current) list.current?.scrollToOffset({ offset: 0, animated: false }); }}
          ListEmptyComponent={<View style={styles.emptyContent}><Icon source="chat-outline" size={48} color={colors.primary} /><Text variant="titleLarge" style={styles.bold}>Make yourself at home</Text><Text style={{ color: colors.onSurfaceVariant, textAlign: 'center' }}>Say hello, share a plan, or ask who finished the milk.</Text></View>}
          ListFooterComponent={thread.hasOlder ? <Button loading={loadingOlder} disabled={loadingOlder} onPress={() => void older()} style={styles.earlier}>Load earlier messages</Button> : messages.length ? <Text variant="labelSmall" style={styles.beginning}>The start of this conversation</Text> : null}
          renderItem={({ item, index }) => {
            const pending = item.kind === 'pending' ? item.pending : undefined;
            const message = item.kind === 'message' ? item.message : undefined;
            const mine = !!pending || message?.senderId === userId;
            const text = message?.text ?? pending!.text;
            const created = message?.createdAt ?? pending!.createdAt;
            const previous = messages[index + 1];
            const previousDate = previous ? previous.kind === 'message' ? previous.message.createdAt : previous.pending.createdAt : null;
            const showDay = !previousDate || messageDay(created) !== messageDay(previousDate);
            const isSelected = !!message && selectedIds.includes(message.id);
            return <View>
              {showDay && <Text variant="labelSmall" style={[styles.day, { color: colors.onSurfaceVariant }]}>{messageDay(created)}</Text>}
              {/* Only confirmed messages can be selected. The row is full width, so a tap beside the bubble counts too. */}
              <Pressable
                disabled={!message}
                delayLongPress={350}
                style={isSelected && { backgroundColor: colors.secondaryContainer }}
                accessibilityState={{ selected: isSelected }}
                accessibilityHint={!message ? undefined : selecting ? 'Tap to select or unselect' : 'Long press to select'}
                accessibilityActions={message ? [{ name: 'longpress', label: 'Select message' }] : undefined}
                onAccessibilityAction={event => { if (event.nativeEvent.actionName === 'longpress' && message) toggleMessage(message); }}
                onLongPress={() => message && toggleMessage(message)}
                onPress={() => message && selecting && toggleMessage(message)}
              >
              <View style={[styles.bubble, mine ? styles.mine : styles.theirs, { backgroundColor: mine ? colors.primaryContainer : colors.surface }]}>
                {!mine && conversation.type === 'HOUSEHOLD' && <Text variant="labelMedium" style={{ color: colors.primary, fontFamily: fonts.semiBold }}>{message?.sender.name}</Text>}
                {/* Selectable text would take the taps that pick messages, so it pauses during a selection. */}
                <Text selectable={!selecting && !message?.deletedAt} style={[styles.messageText, message?.deletedAt && styles.deletedText, { color: mine ? colors.onPrimaryContainer : colors.onSurface }]}>
                  {message?.deletedAt ? 'This message was deleted.' : text}
                </Text>
                <Text variant="labelSmall" style={[styles.time, { color: mine ? colors.onPrimaryContainer : colors.onSurfaceVariant }]}>{messageTime(created)}{pending?.status === 'sending' ? ' · Sending…' : ''}</Text>
                {pending?.status === 'failed' && <View><Text variant="bodySmall" style={{ color: colors.error }}>{pending.error ?? 'Could not send this message.'}</Text>
                  <Button compact icon="refresh" textColor={colors.error} disabled={!conversation.canSend} onPress={() => void useChatStore.getState().send(conversationId, pending.text, pending.clientMessageId)}>Retry message</Button></View>}
              </View>
              </Pressable>
            </View>;
          }} />
        {awayFromBottom && <Button icon="arrow-down" mode="contained-tonal" style={styles.latest} onPress={latest}>Latest messages</Button>}
        {!conversation.canSend ? <Text style={[styles.unavailable, { color: colors.onSurfaceVariant }]}>You can read this chat, but sending is unavailable because a participant has left the household.</Text> :
        <View style={[styles.composerArea, { backgroundColor: colors.surface, borderTopColor: colors.outlineVariant }]}>
          <View style={styles.composer}>
            <TextInput value={draft} onChangeText={text => useChatStore.getState().draft(conversationId, text)} multiline maxLength={4000}
              placeholder="Write a message…" accessibilityLabel="Message" placeholderTextColor={colors.onSurfaceVariant}
              style={[styles.input, { color: colors.onSurface, backgroundColor: colors.surfaceVariant }]} />
            <IconButton icon="send" mode="contained" iconColor={colors.onPrimary} containerColor={colors.primary}
              accessibilityLabel="Send message" disabled={!draft.trim()} onPress={send} size={23} />
          </View>
          {draft.length > 3600 && <Text variant="labelSmall" style={[styles.counter, { color: colors.onSurfaceVariant }]}>{draft.length}/4000</Text>}
        </View>}
      </KeyboardAvoidingView>}
    <AppDialog visible={confirmingDelete && selecting} onDismiss={() => setConfirmingDelete(false)} icon="delete-outline"
      title={selectedMessages.length > 1 ? `Delete ${selectedMessages.length} messages` : 'Delete message'} busy={deleting} stacked>
      <View style={styles.deleteChoices}>
        <Text style={{ color: colors.onSurfaceVariant, textAlign: 'center' }}>
          {selectedMessages.length > 1
            ? 'Delete them only from your chat, or remove them for everyone when available.'
            : 'Delete it only from your chat, or remove it for everyone when available.'}
        </Text>
        {deleteForEveryoneAvailable && <Button mode="contained" icon="delete-forever-outline" buttonColor={colors.error} textColor={colors.onError}
          loading={deleting} disabled={deleting} onPress={() => void removeSelected('everyone')}>Delete for everyone</Button>}
        <Button mode="outlined" icon="delete-outline" disabled={deleting} onPress={() => void removeSelected('me')}>Delete for me</Button>
      </View>
    </AppDialog>
    <AppDialog visible={confirmingClear} onDismiss={() => setConfirmingClear(false)} icon="delete-sweep-outline" title="Clear this chat?" tone="danger"
      confirmLabel="Clear chat" onConfirm={() => void clearChat()} busy={clearing}>
      Every message is removed from your view only. Others in the chat still see them. This cannot be undone.
    </AppDialog>
    <Snackbar visible={!!notice} onDismiss={() => setNotice('')}>{notice}</Snackbar>
  </AppShell>;
}
const styles = StyleSheet.create({
  flex: { flex: 1 }, center: { flex: 1, justifyContent: 'center' },
  context: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  messages: { paddingHorizontal: 16, paddingVertical: 12, width: '100%', maxWidth: 760, alignSelf: 'center' },
  empty: { flexGrow: 1, justifyContent: 'center' }, emptyContent: { alignItems: 'center', padding: 28, gap: 14 },
  bold: { fontFamily: fonts.bold }, bubble: { maxWidth: '86%', borderRadius: 20, paddingHorizontal: 15, paddingVertical: 11, gap: 5, marginVertical: 4 },
  mine: { alignSelf: 'flex-end', borderBottomRightRadius: 5 }, theirs: { alignSelf: 'flex-start', borderBottomLeftRadius: 5 },
  messageText: { fontSize: 16, lineHeight: 24 }, time: { alignSelf: 'flex-end', opacity: 0.8 },
  deletedText: { fontStyle: 'italic', opacity: 0.75 }, deleteChoices: { gap: 12 },
  day: { textAlign: 'center', paddingVertical: 16 }, earlier: { alignSelf: 'center', marginVertical: 12 },
  beginning: { textAlign: 'center', padding: 16, opacity: 0.7 },
  composerArea: { borderTopWidth: StyleSheet.hairlineWidth, padding: 10 }, composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, maxWidth: 760, width: '100%', alignSelf: 'center' },
  input: { flex: 1, borderRadius: 24, paddingHorizontal: 17, paddingTop: 13, paddingBottom: 13, minHeight: 48, maxHeight: 140, fontSize: 16, fontFamily: fonts.regular },
  counter: { textAlign: 'right', paddingRight: 16, paddingTop: 4 }, unavailable: { textAlign: 'center', padding: 18 },
  latest: { alignSelf: 'center', marginBottom: 8 }, error: { flexDirection: 'row', alignItems: 'center', paddingRight: 8 },
});
