import { useCallback, useRef, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { FlatList, Keyboard, KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Badge, Button, Card, Chip, Dialog, HelperText, Icon, IconButton, Portal, Searchbar, Text, TouchableRipple, useTheme } from 'react-native-paper';
import AppShell from '@/components/app-shell';
import HouseholdAvatar from '@/components/household-avatar';
import UserAvatar from '@/components/user-avatar';
import HeaderAction from '@/components/header-action';
import StatusMessage from '@/components/status-message';
import { fonts } from '@/constants/fonts';
import { useAuthStore } from '@/stores/auth-store';
import { useHouseholdStore } from '@/stores/household-store';
import { useChatStore } from '@/stores/chat-store';
import { usePushState } from '@/lib/push-state';
import { registerPush } from '@/lib/push-registration';
import { conversationName, messageSummary, typingLabel } from '@/lib/chat-helpers';
import { presenceLabel, usePresence } from '@/lib/chat-presence';
import { useTyping } from '@/lib/chat-typing';
import { formatWhen, unreadLabel } from '@/lib/notification-helpers';
import { errorMessage } from '@/lib/errors';
import type { Conversation } from '@/api/chat';

export default function ChatsScreen() {
  const { householdId: initialHousehold } = useLocalSearchParams<{ householdId?: string }>();
  const { colors } = useTheme();
  const user = useAuthStore(s => s.session?.user);
  const households = useHouseholdStore(s => s.households);
  const [selection, setSelection] = useState<string>();
  const householdId = selection ?? initialHousehold ?? households?.[0]?.id ?? '';
  const household = households?.find(h => h.id === householdId);
  const ids = useChatStore(s => s.lists[householdId]);
  const conversations = useChatStore(s => s.conversations);
  const typing = useTyping(s => s.typing);
  const presenceUsers = usePresence(s => s.users);
  const connected = useChatStore(s => s.connected);
  const members = useHouseholdStore(s => s.membersByHousehold[householdId]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [picker, setPicker] = useState(false);
  const [memberLoading, setMemberLoading] = useState(false);
  const [memberError, setMemberError] = useState('');
  const [search, setSearch] = useState('');
  const [starting, setStarting] = useState('');
  const startLock = useRef(false);
  const push = usePushState();
  const load = useCallback(async () => {
    setError('');
    try {
      await useHouseholdStore.getState().loadHouseholds();
      if (householdId) await useChatStore.getState().loadList(householdId);
    } catch (e) { setError(errorMessage(e, 'Could not load your chats.')); }
  }, [householdId]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  async function refresh() { setRefreshing(true); try { await load(); } finally { setRefreshing(false); } }
  async function chooseMember() {
    setPicker(true); setSearch(''); setMemberError(''); setMemberLoading(true);
    try { await useHouseholdStore.getState().loadMembers(householdId); }
    catch (e) { setMemberError(errorMessage(e, 'Could not load household members.')); }
    finally { setMemberLoading(false); }
  }
  function dismissPicker() {
    if (startLock.current) return;
    Keyboard.dismiss();
    setPicker(false);
  }
  async function start(recipientId: string) {
    if (startLock.current) return;
    startLock.current = true; setStarting(recipientId); setMemberError('');
    try {
      const id = await useChatStore.getState().direct(householdId, recipientId);
      Keyboard.dismiss();
      setPicker(false);
      router.push({ pathname: '/chats/[conversationId]', params: { conversationId: id } });
    } catch (e) { setMemberError(errorMessage(e, 'Could not open this private chat.')); }
    finally { startLock.current = false; setStarting(''); }
  }
  const rows = (ids ?? []).map(id => conversations[id]).filter((c): c is Conversation => !!c).sort((a, b) =>
    Number(b.type === 'HOUSEHOLD') - Number(a.type === 'HOUSEHOLD') ||
    (b.latestMessage?.createdAt ?? b.createdAt).localeCompare(a.latestMessage?.createdAt ?? a.createdAt));
  const people = (members ?? []).filter(m => m.user.id !== user?.id && m.user.name.toLowerCase().includes(search.trim().toLowerCase()));
  return <AppShell title="Chats" tabs actions={<HeaderAction icon="square-edit-outline" accessibilityLabel="Start a private chat" disabled={!household} onPress={() => void chooseMember()} />}>
    <View style={styles.container}>
      {!!households?.length && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.households} style={styles.selector}>
        {households.map(h => <Chip key={h.id} selected={h.id === householdId} showSelectedOverlay onPress={() => { setSelection(h.id); setError(''); }} accessibilityState={{ selected: h.id === householdId }}>{h.name}</Chip>)}
      </ScrollView>}
      {Platform.OS !== 'web' && !push.enabled && <Card mode="contained" style={[styles.pushCard, { backgroundColor: colors.secondaryContainer }]}>
        <Card.Content><Text variant="titleSmall">Keep up with your household</Text><Text variant="bodySmall">{push.error || 'Enable phone notifications for new chat messages.'}</Text></Card.Content>
        <Card.Actions><Button loading={push.busy} disabled={push.busy} onPress={() => {
          const session = useAuthStore.getState().session;
          if (session) void registerPush(session.token, true, () => useAuthStore.getState().session?.token === session.token, session.user.id);
        }}>Enable notifications</Button></Card.Actions>
      </Card>}
      {households === null ? error ? <StatusMessage text={error} action="Try again" onAction={() => void refresh()} /> : <ActivityIndicator style={styles.center} /> :
      !households.length ? <StatusMessage text="Join or create a household to start chatting." action="Go to households" onAction={() => router.replace('/')} /> :
      !household ? <StatusMessage text="This household is no longer available." action="Show my chats" onAction={() => setSelection(households[0].id)} /> :
      !ids ? error ? <StatusMessage text={error} action="Try again" onAction={() => void refresh()} /> : <ActivityIndicator style={styles.center} accessibilityLabel="Loading chats" /> :
      <FlatList data={rows} extraData={{ typing, presenceUsers, connected }} keyExtractor={c => c.id} contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
        ListHeaderComponent={<View style={styles.heading}><Text variant="headlineSmall" style={styles.bold}>A little closer to home</Text>
          <Text style={{ color: colors.onSurfaceVariant }}>Talk to everyone, or catch up one to one.</Text>
          {!!error && <HelperText type="error">{error}</HelperText>}</View>}
        ListEmptyComponent={<StatusMessage text="No conversations yet." action="Refresh" onAction={() => void refresh()} />}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        ListFooterComponent={<Button icon="account-plus-outline" mode="outlined" style={styles.newChat} onPress={() => void chooseMember()}>Start a private chat</Button>}
        renderItem={({ item }) => {
          const name = conversationName(item, user?.id ?? '');
          const group = item.type === 'HOUSEHOLD';
          const preview = item.latestMessage
            ? (item.latestMessage.senderId === user?.id ? 'You: ' : group ? item.latestMessage.sender.name + ': ' : '') +
              messageSummary(item.latestMessage)
            : group ? 'A shared space for everyone at home.' : 'Say hello to start the conversation.';
          // Someone typing takes the preview's place until their message arrives.
          const onlineStatus = presenceLabel(item, user?.id ?? '', presenceUsers, connected);
          const typingNow = typingLabel(Object.values(typing[item.id] ?? {}), item.type);
          return <TouchableRipple borderless style={[styles.row, { backgroundColor: colors.surface, borderColor: group ? colors.primary : colors.outlineVariant }]}
            accessibilityLabel={name + (item.unreadCount ? ', ' + item.unreadCount + ' unread messages' : '')}
            onPress={() => router.push({ pathname: '/chats/[conversationId]', params: { conversationId: item.id } })}>
            <View style={styles.rowContent}>
              {group ? <HouseholdAvatar url={household?.pictureUrl} size={50} preview name={household?.name} /> : <UserAvatar name={name} url={item.participants.find(p => p.id !== user?.id)?.avatarUrl} size={50} preview />}
              <View style={styles.preview}><View style={styles.nameRow}><Text variant="titleMedium" style={styles.name} numberOfLines={1}>{name}</Text>{item.muted && <Icon source="bell-off-outline" size={16} color={colors.onSurfaceVariant} />}</View>
                <Text numberOfLines={2} variant="bodyMedium" style={{ color: typingNow ? colors.primary : colors.onSurfaceVariant }}>{typingNow ?? preview}</Text>
                <Text variant="labelSmall" style={{ color: colors.primary, marginTop: 5 }}>{onlineStatus ?? (group ? 'EVERYONE AT HOME' : 'PRIVATE CHAT')}</Text></View>
              <View style={styles.meta}>{item.latestMessage && <Text variant="labelSmall" style={{ color: colors.onSurfaceVariant }}>{formatWhen(item.latestMessage.createdAt)}</Text>}
                {item.unreadCount > 0 && <Badge>{unreadLabel(item.unreadCount)}</Badge>}</View>
            </View>
          </TouchableRipple>;
        }} />}
    </View>
    <Portal><KeyboardAvoidingView pointerEvents="box-none" style={styles.pickerKeyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} enabled={picker && Platform.OS !== 'web'}>
      <View pointerEvents="box-none" style={styles.pickerBounds}>
      <Dialog visible={picker} onDismiss={dismissPicker} style={[styles.dialog, { backgroundColor: colors.surface }]}>
      <View style={styles.dialogHeader}>
        <View style={[styles.dialogIcon, { backgroundColor: colors.primaryContainer }]}>
          <Icon source="chat-plus-outline" size={28} color={colors.onPrimaryContainer} />
        </View>
        <IconButton icon="close" accessibilityLabel="Close private chat dialog" disabled={!!starting} onPress={dismissPicker} style={styles.closeButton} />
      </View>
      <View style={styles.dialogIntro}>
        <Text variant="headlineSmall" accessibilityRole="header" style={styles.bold}>Start a private chat</Text>
        <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant }}>A little catch-up, just between you two.</Text>
        <View style={styles.householdLabel}>
          <Icon source="home-outline" size={16} color={colors.primary} />
          <Text variant="labelMedium" numberOfLines={1} style={[styles.householdName, { color: colors.primary }]}>{household?.name ?? 'Your household'}</Text>
        </View>
      </View>
      <Searchbar placeholder="Find a member" accessibilityLabel="Find a household member" value={search} onChangeText={setSearch} style={[styles.search, { backgroundColor: colors.surfaceVariant }]} inputStyle={styles.searchInput} />
      <Dialog.ScrollArea style={[styles.memberList, { borderColor: colors.outlineVariant }]}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.memberListContent}>
        {memberLoading ? <View style={styles.memberState}><ActivityIndicator accessibilityLabel="Loading household members" /><Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant }}>Finding your household members…</Text></View> : memberError ?
          <View style={styles.memberState}><Icon source="alert-circle-outline" size={30} color={colors.error} /><Text variant="bodyMedium" accessibilityRole="alert" style={[styles.stateText, { color: colors.error }]}>{memberError}</Text><Button mode="outlined" onPress={() => void chooseMember()}>Try again</Button></View> :
          people.length ? people.map(m => <TouchableRipple key={m.user.id} borderless disabled={!!starting} onPress={() => void start(m.user.id)}
            accessibilityRole="button" accessibilityLabel={`Start a private chat with ${m.user.name}`} accessibilityState={{ disabled: !!starting, busy: starting === m.user.id }}
            style={[styles.memberRow, { backgroundColor: starting === m.user.id ? colors.primaryContainer : colors.elevation.level1, opacity: starting && starting !== m.user.id ? 0.5 : 1 }]}>
            <View style={styles.memberRowContent}>
              <UserAvatar name={m.user.name} url={m.user.avatarUrl} size={44} />
              <View style={styles.memberDetails}><Text variant="titleSmall" numberOfLines={1} style={styles.bold}>{m.user.name}</Text><Text variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>{starting === m.user.id ? 'Opening your chat…' : 'Tap to say hello'}</Text></View>
              {starting === m.user.id ? <ActivityIndicator size="small" /> : <Icon source="chevron-right" size={22} color={colors.primary} />}
            </View>
          </TouchableRipple>) :
          <View style={styles.memberState}><Icon source={search.trim() ? 'account-search-outline' : 'account-group-outline'} size={36} color={colors.onSurfaceVariant} /><Text variant="titleSmall" style={styles.bold}>{search.trim() ? 'No members found' : 'A little quiet here'}</Text><Text variant="bodyMedium" style={[styles.stateText, { color: colors.onSurfaceVariant }]}>{search.trim() ? 'Try another name to find your person.' : 'Invite another member to start a private chat.'}</Text></View>}
      </ScrollView></Dialog.ScrollArea>
      <Dialog.Actions style={styles.dialogActions}><Button mode="text" disabled={!!starting} onPress={dismissPicker}>Cancel</Button></Dialog.Actions>
    </Dialog></View></KeyboardAvoidingView></Portal>
  </AppShell>;
}
const styles = StyleSheet.create({
  container: { flex: 1, width: '100%', maxWidth: 760, alignSelf: 'center' },
  selector: { flexGrow: 0 }, households: { padding: 16, gap: 8 },
  pushCard: { marginHorizontal: 16, marginBottom: 8, borderRadius: 20 },
  center: { flex: 1, justifyContent: 'center' },
  list: { padding: 16, paddingBottom: 32 }, heading: { gap: 8, paddingBottom: 24 },
  bold: { fontFamily: fonts.bold }, row: { borderRadius: 22, borderWidth: 1 },
  rowContent: { flexDirection: 'row', padding: 16, gap: 12, alignItems: 'center' },
  preview: { flex: 1, gap: 4 }, nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontFamily: fonts.semiBold, flexShrink: 1 }, meta: { alignItems: 'flex-end', gap: 10, maxWidth: 76 },
  newChat: { marginTop: 24 }, dialog: { maxWidth: 520, width: '90%', alignSelf: 'center', marginHorizontal: 0, borderRadius: 28, maxHeight: '90%' },
  pickerKeyboard: { ...StyleSheet.absoluteFill }, pickerBounds: { flex: 1 },
  dialogHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24 },
  dialogIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  closeButton: { margin: 0 }, dialogIntro: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 20, gap: 8 },
  householdLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }, householdName: { flexShrink: 1 },
  search: { marginHorizontal: 24, marginBottom: 20, borderRadius: 16 }, searchInput: { fontSize: 14 },
  memberList: { maxHeight: 340, paddingHorizontal: 24, flexShrink: 1 }, memberListContent: { paddingVertical: 16, gap: 10 },
  memberRow: { borderRadius: 18, overflow: 'hidden' }, memberRowContent: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  memberDetails: { flex: 1, gap: 4 }, memberState: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 8, gap: 12 },
  stateText: { textAlign: 'center' }, dialogActions: { paddingHorizontal: 24, paddingVertical: 12 },
});
