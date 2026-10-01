import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { AppState, BackHandler, FlatList, Pressable, StyleSheet, TextInput, useWindowDimensions, View, type ViewToken } from 'react-native';
import { ActivityIndicator, Button, HelperText, Icon, IconButton, Menu, Snackbar, Text, useTheme } from 'react-native-paper';
import AppShell from '@/components/app-shell';
import AppDialog from '@/components/ui/app-dialog';
import ChatPhoto from '@/components/chat-photo';
import HeaderAction from '@/components/header-action';
import ImageViewer, { type ViewerPhoto } from '@/components/image-viewer';
import KeyboardAvoidingBody from '@/components/keyboard-avoiding-body';
import MessageInfoDialog from '@/components/message-info-dialog';
import StatusMessage from '@/components/status-message';
import UserAvatar from '@/components/user-avatar';
import { fonts } from '@/constants/fonts';
import { isApiError } from '@/api/client';
import { conversationName, deleteForEveryoneUntil, editableUntil, isEdited, MAX_SELECTION, messageDay, messagePhoto, messageSpokenText, messageStatus, messageSummary, messageTime, startsSenderRun, toggleSelection, typingLabel, type MessageStatus } from '@/lib/chat-helpers';
import { presenceLabel, usePresence } from '@/lib/chat-presence';
import { reportTyping, useTyping } from '@/lib/chat-typing';
import { errorMessage } from '@/lib/errors';
import { chatPhotoUrl } from '@/lib/images';
import { pickImage, type ImageSource } from '@/lib/pick-image';
import { useAuthStore } from '@/stores/auth-store';
import { useChatStore, type PendingMessage } from '@/stores/chat-store';
import { useHouseholdStore } from '@/stores/household-store';
import type { Message } from '@/api/chat';

const VIEWABILITY = { itemVisiblePercentThreshold: 60, minimumViewTime: 250 };
// One tick: the server has it. Two: it reached everyone. Two coloured: everyone has read it.
const STATUS_LABELS: Record<MessageStatus, string> = { sent: 'Sent', delivered: 'Delivered', read: 'Read' };
type Row = { kind: 'message'; key: string; message: Message } | { kind: 'pending'; key: string; pending: PendingMessage };
// Whether the clock is still before `deadline`. It turns false the moment the deadline passes, even
// while a dialog is open, and is checked again when the app comes back from the background.
function useStillBefore(deadline: number | null): boolean {
  const [before, setBefore] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      clearTimeout(timer);
      const remaining = deadline === null ? 0 : deadline - Date.now();
      setBefore(remaining > 0);
      if (remaining > 0) timer = setTimeout(update, remaining);
    };
    timer = setTimeout(update, 0);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') update();
    });
    return () => { clearTimeout(timer); subscription.remove(); };
  }, [deadline]);
  return before;
}
export default function ChatScreen() {
  const { conversationId = '' } = useLocalSearchParams<{ conversationId: string }>();
  const { colors } = useTheme();
  const userId = useAuthStore(s => s.session?.user.id) ?? '';
  const conversation = useChatStore(s => s.conversations[conversationId]);
  const thread = useChatStore(s => s.threads[conversationId]);
  const error = useChatStore(s => s.errors[conversationId]);
  const draft = useChatStore(s => s.drafts[conversationId] ?? '');
  const draftPhoto = useChatStore(s => s.draftPhotos[conversationId]);
  const connected = useChatStore(s => s.connected);
  const presenceUsers = usePresence(s => s.users);
  const onlineStatus = conversation ? presenceLabel(conversation, userId, presenceUsers, connected) : null;
  const typists = useTyping(s => s.typing[conversationId]);
  const typing = conversation ? typingLabel(Object.values(typists ?? {}), conversation.type) : null;
  const household = useHouseholdStore(s => s.households?.find(h => h.id === conversation?.householdId));
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [muting, setMuting] = useState(false);
  const [notice, setNotice] = useState('');
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  // Long-pressing a message starts a selection; after that a tap adds or removes one.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Editing borrows the composer for one of the user's own messages; the draft waits untouched.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const input = useRef<TextInput>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [photoMenu, setPhotoMenu] = useState(false);
  const [picking, setPicking] = useState(false);
  const [viewing, setViewing] = useState<ViewerPhoto | null>(null);
  const { width: windowWidth } = useWindowDimensions();
  // A photo fills its bubble: the list's side padding, the bubble's share of the row, its own
  // padding and, in the household chat, the picture column all come off the screen width.
  const photoWidth = Math.floor(Math.min(260, (Math.min(windowWidth, 760) - 32 - (conversation?.type === 'HOUSEHOLD' ? 40 : 0)) * 0.86 - 10));
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
      // A selection or an edit does not follow the user to another screen or another chat.
      setSelectedIds([]); setConfirmingDelete(false); setEditingId(null);
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
  // With a photo, the text is its caption and may be left empty.
  function send() {
    if ((!draft.trim() && !draftPhoto) || !conversation?.canSend) return;
    void useChatStore.getState().send(conversationId, draft, undefined, draftPhoto);
    latest();
  }
  // A new pick replaces a photo already waiting, since a message carries one.
  async function attach(source: ImageSource) {
    setPhotoMenu(false);
    if (picking) return;
    setPicking(true);
    try {
      const file = await pickImage(source);
      if (file) useChatStore.getState().attach(conversationId, file);
    } catch (e) { setNotice(errorMessage(e, 'Could not open that photo.')); }
    finally { setPicking(false); }
  }
  // The selection is read from the thread, so a message deleted on another device drops out of it.
  const selectedMessages = useMemo(() => (thread?.messages ?? []).filter(message => selectedIds.includes(message.id)), [thread?.messages, selectedIds]);
  const selecting = selectedMessages.length > 0;
  const everyoneUntil = deleteForEveryoneUntil(selectedMessages, userId);
  // "Message info" explains one message, and only its sender may ask who has read it.
  const [infoMessage, setInfoMessage] = useState<Message | null>(null);
  const only = selectedMessages.length === 1 ? selectedMessages[0] : undefined;
  const infoTarget = only && only.senderId === userId && !only.deletedAt ? only : undefined;
  // Edit is offered for one of the user's own messages while it is under 15 minutes old, and is
  // withdrawn the moment it passes that age. Editing needs the composer, so a chat that cannot be
  // sent to offers no edit.
  const onlyEditable = useStillBefore(only ? editableUntil(only, userId) : null);
  const editTarget = only && onlyEditable && conversation?.canSend ? only : undefined;
  // The message being edited, read from the thread. If it is deleted meanwhile, editing just ends.
  const editingFound = editingId ? thread?.messages.find(message => message.id === editingId) : undefined;
  const editing = editingFound && !editingFound.deletedAt ? editingFound : undefined;
  const editValid = !!editing && (!!editText.trim() || !!messagePhoto(editing));
  function startEdit(message: Message) {
    setEditingId(message.id); setEditText(message.text); setSelectedIds([]);
    input.current?.focus();
  }
  // Saving the text it already has just closes the editor. A refusal that no retry can fix, such
  // as the 15 minutes running out, closes it too; a network failure keeps the text for another go.
  async function saveEdit() {
    if (!editing || !editValid || savingEdit) return;
    if (editText.trim() === editing.text) { setEditingId(null); return; }
    setSavingEdit(true);
    try {
      await useChatStore.getState().edit(conversationId, editing.id, editText);
      setEditingId(null);
    } catch (e) {
      setNotice(errorMessage(e, 'Could not edit this message.'));
      if (isApiError(e) && [403, 404, 409].includes(e.status)) setEditingId(null);
    } finally { setSavingEdit(false); }
  }
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
  // While editing, Android's back button cancels the edit instead of leaving the chat.
  const isEditing = !!editing;
  useEffect(() => {
    if (!isEditing) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { setEditingId(null); return true; });
    return () => subscription.remove();
  }, [isEditing]);
  // "Delete for everyone" is withdrawn the moment the oldest selected message passes 15 minutes,
  // even while the dialog is open or the app was in the background.
  const deleteForEveryoneAvailable = useStillBefore(everyoneUntil);
  // A selection takes over the header: a count, a close button and the delete action.
  const hasHistory = !!thread && (thread.messages.length > 0 || thread.hasOlder);
  return <AppShell title={selecting ? `${selectedMessages.length} selected` : conversation ? conversationName(conversation, userId) : 'Chat'} back
    onClose={selecting ? () => setSelectedIds([]) : undefined}
    actions={selecting ? <>
        {/* Long press already selects, so edit and info live here, the way WhatsApp does it. */}
        {editTarget && <HeaderAction icon="pencil-outline" accessibilityLabel="Edit message" onPress={() => startEdit(editTarget)} />}
        {infoTarget && <HeaderAction icon="information-outline" accessibilityLabel="Message info" onPress={() => { setInfoMessage(infoTarget); setSelectedIds([]); }} />}
        <HeaderAction icon="delete-outline" accessibilityLabel="Delete selected messages" onPress={() => setConfirmingDelete(true)} />
      </> :
      conversation ? <>
        <HeaderAction icon="delete-sweep-outline" accessibilityLabel="Clear chat" disabled={!hasHistory || clearing} onPress={() => setConfirmingClear(true)} />
        <HeaderAction icon={conversation.muted ? 'bell-off-outline' : 'bell-outline'} accessibilityLabel={conversation.muted ? 'Unmute chat notifications' : 'Mute chat notifications'}
          disabled={muting} onPress={() => void mute()} />
      </> : undefined}>
    {!thread || !conversation ? error ? <StatusMessage text={error} action="Try again" onAction={() => void useChatStore.getState().sync(conversationId).catch(() => {})} /> :
      <ActivityIndicator style={styles.center} accessibilityLabel="Loading conversation" /> :
      <KeyboardAvoidingBody>
        <View style={[styles.context, { borderColor: colors.outlineVariant }]}>
          <Icon source={conversation.type === 'HOUSEHOLD' ? 'account-group-outline' : 'lock-outline'} size={17} color={colors.primary} />
          {/* While someone types, this line says so instead of naming the household. */}
          {typing ? <Text variant="labelMedium" numberOfLines={1} style={{ color: colors.primary, flex: 1 }}>{typing}</Text> :
          <Text variant="labelMedium" numberOfLines={1} style={{ color: onlineStatus === 'Online' ? colors.primary : colors.onSurfaceVariant, flex: 1 }}>
            {onlineStatus ?? ((household?.name ? household.name + ' · ' : '') + (conversation.type === 'HOUSEHOLD' ? 'Everyone at home' : 'One-to-one chat'))}{conversation.muted ? ' · Muted' : ''}
          </Text>}
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
            // Ticks belong to the user's own confirmed messages. A deleted one has nothing to report.
            const status = message && mine && !message.deletedAt ? messageStatus(message, conversation.receipts) : undefined;
            // Other people's messages in the household chat sit beside a picture column.
            const theirsInGroup = !!message && !mine && conversation.type === 'HOUSEHOLD';
            const headsRun = theirsInGroup && startsSenderRun(message, previous?.kind === 'message' ? previous.message : undefined);
            // The member list has the person's current picture. Someone who has left the household
            // is no longer in it, so the copy that came with their message is the fallback.
            const senderAvatar = message && (conversation.participants.find(p => p.id === message.senderId) ?? message.sender).avatarUrl;
            // A sent photo comes from Cloudinary; an unsent one shows the local file until then.
            const photo = message ? messagePhoto(message) : undefined;
            const localPhoto = pending?.photo;
            const hasPhoto = !!photo || !!localPhoto;
            const shownText = message?.deletedAt ? 'This message was deleted.' : text;
            const edited = !!message && isEdited(message);
            return <View>
              {showDay && <Text variant="labelSmall" style={[styles.day, { color: colors.onSurfaceVariant }]}>{messageDay(created)}</Text>}
              {/* Only confirmed messages can be selected. The row is full width, so a tap beside the bubble counts too. */}
              <Pressable
                disabled={!message}
                delayLongPress={350}
                style={isSelected && { backgroundColor: colors.secondaryContainer }}
                accessibilityState={{ selected: isSelected }}
                // Only the first bubble of a run shows the sender, so a screen reader is told on every one.
                accessibilityLabel={theirsInGroup ? `${message.sender.name}: ${messageSpokenText(message)}, ${messageTime(created)}` : undefined}
                accessibilityHint={!message ? undefined : selecting ? 'Tap to select or unselect' : 'Long press to select'}
                accessibilityActions={message ? [{ name: 'longpress', label: 'Select message' }] : undefined}
                onAccessibilityAction={event => { if (event.nativeEvent.actionName === 'longpress' && message) toggleMessage(message); }}
                onLongPress={() => message && toggleMessage(message)}
                onPress={() => message && selecting && toggleMessage(message)}
              >
              <View style={theirsInGroup && styles.theirRow}>
              {/* The column stays, empty, under the first bubble of a run, so the bubbles line up. */}
              {theirsInGroup && <View style={styles.avatarSlot}>{headsRun && <UserAvatar name={message.sender.name} url={senderAvatar} size={32} preview={!selecting} />}</View>}
              <View style={theirsInGroup && styles.flex}>
              <View style={[styles.bubble, hasPhoto && styles.photoBubble, mine ? styles.mine : styles.theirs, { backgroundColor: mine ? colors.primaryContainer : colors.surface }]}>
                {headsRun && <Text variant="labelMedium" style={[{ color: colors.primary, fontFamily: fonts.semiBold }, hasPhoto && styles.inset]}>{message.sender.name}</Text>}
                {/* A tap opens the photo, or during a selection picks the message like the rest of the bubble. */}
                {message && photo && <ChatPhoto uri={chatPhotoUrl(photo.url)} width={photo.width} height={photo.height} maxWidth={photoWidth}
                  accessibilityLabel={`Photo from ${message.sender.name}`}
                  onPress={() => selecting ? toggleMessage(message) : setViewing({ ...photo, uploadedBy: message.sender })}
                  onLongPress={() => toggleMessage(message)} />}
                {localPhoto && <ChatPhoto uri={localPhoto.uri} width={localPhoto.width} height={localPhoto.height} maxWidth={photoWidth}
                  busy={pending?.status === 'sending'} accessibilityLabel="Your photo" />}
                {/* Selectable text would take the taps that pick messages, so it pauses during a selection. */}
                {!!shownText && <Text selectable={!selecting && !message?.deletedAt} style={[styles.messageText, message?.deletedAt && styles.deletedText, hasPhoto && styles.inset, { color: mine ? colors.onPrimaryContainer : colors.onSurface }]}>
                  {shownText}
                </Text>}
                <View style={[styles.meta, hasPhoto && styles.inset]} accessible accessibilityLabel={`${edited ? 'Edited, ' : ''}${messageTime(created)}${status ? ', ' + STATUS_LABELS[status] : pending?.status === 'sending' ? ', sending' : ''}`}>
                  <Text variant="labelSmall" style={{ color: mine ? colors.onPrimaryContainer : colors.onSurfaceVariant }}>
                    {edited ? 'Edited ' : ''}{messageTime(created)}{pending?.status === 'sending' ? pending.photo && !pending.uploaded ? ' · Uploading…' : ' · Sending…' : ''}
                  </Text>
                  {status && <Icon source={status === 'sent' ? 'check' : 'check-all'} size={16} color={status === 'read' ? colors.primary : colors.onPrimaryContainer} />}
                </View>
                {pending?.status === 'failed' && <View style={hasPhoto && styles.inset}><Text variant="bodySmall" style={{ color: colors.error }}>{pending.error ?? 'Could not send this message.'}</Text>
                  <Button compact icon="refresh" textColor={colors.error} disabled={!conversation.canSend} onPress={() => void useChatStore.getState().send(conversationId, pending.text, pending.clientMessageId)}>Retry message</Button></View>}
              </View>
              </View>
              </View>
              </Pressable>
            </View>;
          }} />
        {awayFromBottom && <Button icon="arrow-down" mode="contained-tonal" style={styles.latest} onPress={latest}>Latest messages</Button>}
        {!conversation.canSend ? <Text style={[styles.unavailable, { color: colors.onSurfaceVariant }]}>You can read this chat, but sending is unavailable because a participant has left the household.</Text> :
        <View style={[styles.composerArea, { backgroundColor: colors.surface, borderTopColor: colors.outlineVariant }]}>
          {/* While editing, the bar shows which message is changing; the photo draft waits underneath. */}
          {editing ? <View style={[styles.attachment, styles.editBar, { backgroundColor: colors.surfaceVariant }]}>
            <Icon source="pencil-outline" size={20} color={colors.primary} />
            <View style={styles.flex}>
              <Text variant="labelMedium" style={{ color: colors.primary, fontFamily: fonts.semiBold }}>Editing message</Text>
              <Text variant="bodySmall" numberOfLines={1} style={{ color: colors.onSurfaceVariant }}>{messageSummary(editing)}</Text>
            </View>
            <IconButton icon="close" size={20} accessibilityLabel="Cancel editing" disabled={savingEdit} onPress={() => setEditingId(null)} />
          </View> :
          // The photo waits here until it is sent, so the caption can be written underneath it.
          draftPhoto && <View style={[styles.attachment, { backgroundColor: colors.surfaceVariant }]}>
            <Image source={{ uri: draftPhoto.uri }} style={styles.attachmentImage} contentFit="cover" accessibilityLabel="Photo to send" />
            <Text variant="bodyMedium" style={[styles.flex, { color: colors.onSurfaceVariant }]}>Add a caption, or send the photo as it is.</Text>
            <IconButton icon="close" size={20} accessibilityLabel="Remove photo" onPress={() => useChatStore.getState().attach(conversationId, null)} />
          </View>}
          <View style={styles.composer}>
            {!editing && <Menu visible={photoMenu} onDismiss={() => setPhotoMenu(false)} anchor={
              <IconButton icon="image-plus-outline" size={24} accessibilityLabel="Add a photo" disabled={picking} onPress={() => setPhotoMenu(true)} style={styles.attach} />}>
              <Menu.Item leadingIcon="camera-outline" title="Take photo" onPress={() => void attach('camera')} />
              <Menu.Item leadingIcon="image-multiple-outline" title="Choose from library" onPress={() => void attach('library')} />
            </Menu>}
            <TextInput ref={input} value={editing ? editText : draft} multiline maxLength={4000}
              onChangeText={text => {
                if (editing) { setEditText(text); return; }
                useChatStore.getState().draft(conversationId, text);
                // Fixing an old message, or emptying the box, is not typing a new one.
                if (text.trim()) reportTyping(conversationId);
              }}
              placeholder={editing ? messagePhoto(editing) ? 'Add a caption…' : 'Edit your message…' : draftPhoto ? 'Add a caption…' : 'Write a message…'}
              accessibilityLabel={editing ? 'Edited message' : draftPhoto ? 'Photo caption' : 'Message'} placeholderTextColor={colors.onSurfaceVariant}
              style={[styles.input, { color: colors.onSurface, backgroundColor: colors.surfaceVariant }]} />
            {editing ? <IconButton icon="check" mode="contained" iconColor={colors.onPrimary} containerColor={colors.primary}
              accessibilityLabel="Save edit" disabled={!editValid || savingEdit} onPress={() => void saveEdit()} size={23} /> :
            <IconButton icon="send" mode="contained" iconColor={colors.onPrimary} containerColor={colors.primary}
              accessibilityLabel={draftPhoto ? 'Send photo' : 'Send message'} disabled={!draft.trim() && !draftPhoto} onPress={send} size={23} />}
          </View>
          {(editing ? editText : draft).length > 3600 && <Text variant="labelSmall" style={[styles.counter, { color: colors.onSurfaceVariant }]}>{(editing ? editText : draft).length}/4000</Text>}
        </View>}
      </KeyboardAvoidingBody>}
    <MessageInfoDialog conversationId={conversationId} message={infoMessage} receipts={conversation?.receipts} onDismiss={() => setInfoMessage(null)} />
    {/* Chat photos go with their message: deleting the message is the way to remove one. */}
    <ImageViewer photo={viewing} canRemove={false} busy={false} onClose={() => setViewing(null)} onRemove={() => {}} />
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
  theirRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 }, avatarSlot: { width: 32, marginTop: 4 },
  flex: { flex: 1 }, center: { flex: 1, justifyContent: 'center' },
  context: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  messages: { paddingHorizontal: 16, paddingVertical: 12, width: '100%', maxWidth: 760, alignSelf: 'center' },
  empty: { flexGrow: 1, justifyContent: 'center' }, emptyContent: { alignItems: 'center', padding: 28, gap: 14 },
  bold: { fontFamily: fonts.bold }, bubble: { maxWidth: '86%', borderRadius: 20, paddingHorizontal: 15, paddingVertical: 11, gap: 5, marginVertical: 4 },
  mine: { alignSelf: 'flex-end', borderBottomRightRadius: 5 }, theirs: { alignSelf: 'flex-start', borderBottomLeftRadius: 5 },
  // A photo runs almost to the bubble's edge; the name, caption and time keep the usual inset.
  photoBubble: { paddingHorizontal: 5, paddingTop: 5, paddingBottom: 8 }, inset: { paddingHorizontal: 10 },
  attachment: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, padding: 8, marginBottom: 8, maxWidth: 760, width: '100%', alignSelf: 'center' },
  attachmentImage: { width: 56, height: 56, borderRadius: 10 }, attach: { margin: 0, marginBottom: 4 },
  editBar: { paddingLeft: 14 },
  messageText: { fontSize: 16, lineHeight: 24 }, meta: { alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 4, opacity: 0.8 },
  deletedText: { fontStyle: 'italic', opacity: 0.75 }, deleteChoices: { gap: 12 },
  day: { textAlign: 'center', paddingVertical: 16 }, earlier: { alignSelf: 'center', marginVertical: 12 },
  beginning: { textAlign: 'center', padding: 16, opacity: 0.7 },
  composerArea: { borderTopWidth: StyleSheet.hairlineWidth, padding: 10 }, composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, maxWidth: 760, width: '100%', alignSelf: 'center' },
  input: { flex: 1, borderRadius: 24, paddingHorizontal: 17, paddingTop: 13, paddingBottom: 13, minHeight: 48, maxHeight: 140, fontSize: 16, fontFamily: fonts.regular },
  counter: { textAlign: 'right', paddingRight: 16, paddingTop: 4 }, unavailable: { textAlign: 'center', padding: 18 },
  latest: { alignSelf: 'center', marginBottom: 8 }, error: { flexDirection: 'row', alignItems: 'center', paddingRight: 8 },
});
