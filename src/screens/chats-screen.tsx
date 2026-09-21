import { useCallback, useRef, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { FlatList, Platform, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Avatar, Badge, Button, Card, Chip, Dialog, Divider, HelperText, Icon, List, Portal, Searchbar, Text, TouchableRipple, useTheme } from 'react-native-paper';
import AppShell from '@/components/app-shell';
import HeaderAction from '@/components/header-action';
import StatusMessage from '@/components/status-message';
import { fonts } from '@/constants/fonts';
import { useAuthStore } from '@/stores/auth-store';
import { useHouseholdStore } from '@/stores/household-store';
import { useChatStore } from '@/stores/chat-store';
import { usePushState } from '@/lib/push-state';
import { registerPush } from '@/lib/push-registration';
import { conversationName, initial } from '@/lib/chat-helpers';
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
  async function start(recipientId: string) {
    if (startLock.current) return;
    startLock.current = true; setStarting(recipientId); setMemberError('');
    try {
      const id = await useChatStore.getState().direct(householdId, recipientId);
      setPicker(false);
      router.push({ pathname: '/chats/[conversationId]', params: { conversationId: id } });
    } catch (e) { setMemberError(errorMessage(e, 'Could not open this private chat.')); }
    finally { startLock.current = false; setStarting(''); }
  }
  const rows = (ids ?? []).map(id => conversations[id]).filter((c): c is Conversation => !!c).sort((a, b) =>
    Number(b.type === 'HOUSEHOLD') - Number(a.type === 'HOUSEHOLD') ||
    (b.latestMessage?.createdAt ?? b.createdAt).localeCompare(a.latestMessage?.createdAt ?? a.createdAt));
  const people = (members ?? []).filter(m => m.user.id !== user?.id && m.user.name.toLowerCase().includes(search.trim().toLowerCase()));
  return <AppShell title="Chats" back actions={<HeaderAction icon="square-edit-outline" accessibilityLabel="Start a private chat" disabled={!household} onPress={() => void chooseMember()} />}>
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
      <FlatList data={rows} keyExtractor={c => c.id} contentContainerStyle={styles.list}
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
              (item.latestMessage.deletedAt ? 'This message was deleted.' : item.latestMessage.text)
            : group ? 'A shared space for everyone at home.' : 'Say hello to start the conversation.';
          return <TouchableRipple borderless style={[styles.row, { backgroundColor: colors.surface, borderColor: group ? colors.primary : colors.outlineVariant }]}
            accessibilityLabel={name + (item.unreadCount ? ', ' + item.unreadCount + ' unread messages' : '')}
            onPress={() => router.push({ pathname: '/chats/[conversationId]', params: { conversationId: item.id } })}>
            <View style={styles.rowContent}>
              {group ? <Avatar.Icon size={50} icon="home-heart" /> : <Avatar.Text size={50} label={initial(name)} style={{ backgroundColor: colors.secondaryContainer }} color={colors.onSecondaryContainer} />}
              <View style={styles.preview}><View style={styles.nameRow}><Text variant="titleMedium" style={styles.name} numberOfLines={1}>{name}</Text>{item.muted && <Icon source="bell-off-outline" size={16} color={colors.onSurfaceVariant} />}</View>
                <Text numberOfLines={2} variant="bodyMedium" style={{ color: colors.onSurfaceVariant }}>{preview}</Text>
                <Text variant="labelSmall" style={{ color: colors.primary, marginTop: 5 }}>{group ? 'EVERYONE AT HOME' : 'PRIVATE CHAT'}</Text></View>
              <View style={styles.meta}>{item.latestMessage && <Text variant="labelSmall" style={{ color: colors.onSurfaceVariant }}>{formatWhen(item.latestMessage.createdAt)}</Text>}
                {item.unreadCount > 0 && <Badge>{unreadLabel(item.unreadCount)}</Badge>}</View>
            </View>
          </TouchableRipple>;
        }} />}
    </View>
    <Portal><Dialog visible={picker} onDismiss={() => { if (!starting) setPicker(false); }} style={styles.dialog}>
      <Dialog.Title>Start a private chat</Dialog.Title>
      <Dialog.Content><Text variant="bodyMedium">Choose someone from {household?.name ?? 'your household'}.</Text></Dialog.Content>
      <Searchbar placeholder="Find a member" accessibilityLabel="Find a household member" value={search} onChangeText={setSearch} style={styles.search} />
      <Dialog.ScrollArea style={styles.memberList}><ScrollView keyboardShouldPersistTaps="handled">
        {memberLoading ? <ActivityIndicator style={{ padding: 24 }} /> : memberError ? <View><HelperText type="error">{memberError}</HelperText><Button onPress={() => void chooseMember()}>Try again</Button></View> :
          people.length ? people.map(m => <View key={m.user.id}><List.Item title={m.user.name} description="Private conversation" disabled={!!starting} onPress={() => void start(m.user.id)}
            left={() => <Avatar.Text size={42} label={initial(m.user.name)} />}
            right={() => starting === m.user.id ? <ActivityIndicator size="small" /> : <Icon source="chevron-right" size={24} />} /><Divider /></View>) :
          <Text style={{ padding: 24 }}>{search ? 'No members match your search.' : 'Invite another member to start a private chat.'}</Text>}
      </ScrollView></Dialog.ScrollArea>
      <Dialog.Actions><Button disabled={!!starting} onPress={() => setPicker(false)}>Cancel</Button></Dialog.Actions>
    </Dialog></Portal>
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
  newChat: { marginTop: 24 }, dialog: { maxWidth: 520, width: '90%', alignSelf: 'center' },
  search: { marginHorizontal: 20, marginBottom: 16 }, memberList: { maxHeight: 340, paddingHorizontal: 20 },
});
