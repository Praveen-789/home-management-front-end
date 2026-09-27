import { useCallback, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { FlatList, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Chip, FAB, HelperText, Snackbar } from 'react-native-paper';
import type { Photo } from '@/api/images';
import type { Post } from '@/api/posts';
import AppShell from '@/components/app-shell';
import ImageViewer from '@/components/image-viewer';
import PostCard from '@/components/post-card';
import StatusMessage from '@/components/status-message';
import AppDialog from '@/components/ui/app-dialog';
import usePushOnce from '@/hooks/use-push-once';
import { errorMessage } from '@/lib/errors';
import { canDeletePost } from '@/lib/post-permissions';
import { useAuthStore } from '@/stores/auth-store';
import { useHouseholdStore } from '@/stores/household-store';
import { usePostStore } from '@/stores/post-store';

const LOAD_ERROR = 'Could not load the posts.';

// The Posts tab: one household's feed, newest first, with the same household chips as Chats.
export default function PostsScreen() {
  const { push, navigating } = usePushOnce();
  const { householdId: initialHousehold } = useLocalSearchParams<{ householdId?: string }>();
  const [selection, setSelection] = useState<string>();
  const user = useAuthStore((state) => state.session?.user);
  const households = useHouseholdStore((state) => state.households);
  const householdId = selection ?? initialHousehold ?? households?.[0]?.id ?? '';
  const household = households?.find((row) => row.id === householdId);
  const feed = usePostStore((state) => state.feedsByHousehold[householdId]);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [viewing, setViewing] = useState<Photo | null>(null);
  const [deleting, setDeleting] = useState<Post | null>(null);
  const [likingId, setLikingId] = useState('');

  // Posts arrive while the user is elsewhere, so the feed is refreshed on every return here.
  useFocusEffect(useCallback(() => {
    useHouseholdStore.getState().loadHouseholds().catch(() => {});
    if (householdId) usePostStore.getState().loadFeed(householdId).catch((error: unknown) => setError(errorMessage(error, LOAD_ERROR)));
  }, [householdId]));

  async function refresh() {
    setRefreshing(true);
    setError('');
    try { await Promise.all([useHouseholdStore.getState().loadHouseholds(), usePostStore.getState().loadFeed(householdId)]); }
    catch (error) { setError(errorMessage(error, LOAD_ERROR)); }
    finally { setRefreshing(false); }
  }

  // The next, older page. `nextCursor` null means the whole feed is already here.
  async function loadMore() {
    if (loadingMore || !feed?.nextCursor) return;
    setLoadingMore(true);
    try { await usePostStore.getState().loadFeed(householdId, feed.nextCursor); }
    catch (error) { setNotice(errorMessage(error, LOAD_ERROR)); }
    finally { setLoadingMore(false); }
  }

  async function toggleLike(post: Post) {
    if (likingId) return;
    setLikingId(post.id);
    try { await usePostStore.getState().setLike(householdId, post.id, !post.likedByMe); }
    catch (error) { setNotice(errorMessage(error, 'Could not update the like.')); }
    finally { setLikingId(''); }
  }

  // Runs once the person confirms in the dialog below.
  async function deletePost(post: Post) {
    setDeleting(null);
    try {
      await usePostStore.getState().deletePost(householdId, post.id);
      setNotice('Post deleted.');
    } catch (error) { setNotice(errorMessage(error, 'Could not delete the post.')); }
  }

  return (
    <AppShell title={household ? `Posts · ${household.name}` : 'Posts'} compact tabs>
      <View style={styles.container}>
        {!!households && households.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.households} style={styles.selector}>
            {households.map((row) => (
              <Chip key={row.id} selected={row.id === householdId} showSelectedOverlay accessibilityState={{ selected: row.id === householdId }}
                onPress={() => { setSelection(row.id); setError(''); }}>{row.name}</Chip>
            ))}
          </ScrollView>
        )}
        {households === null ? (error ? <StatusMessage text={error} action="Try again" onAction={() => void refresh()} /> : <ActivityIndicator style={styles.center} />) :
        !households.length ? <StatusMessage text="Join or create a household to share posts." action="Go to households" onAction={() => router.replace('/')} /> :
        !household ? <StatusMessage text="This household is no longer available." action="Show my posts" onAction={() => setSelection(households[0].id)} /> :
        !feed ? (error ? <StatusMessage text={error} action="Try again" onAction={() => void refresh()} /> : <ActivityIndicator style={styles.center} accessibilityLabel="Loading posts" />) : (
          <FlatList
            data={feed.posts}
            keyExtractor={(post) => post.id}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
            onEndReached={() => void loadMore()}
            onEndReachedThreshold={0.4}
            ListHeaderComponent={error ? <HelperText type="error">{error}</HelperText> : null}
            ListEmptyComponent={<StatusMessage text="No posts yet. Share the first one!" action="Refresh" onAction={() => void refresh()} />}
            ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.footer} accessibilityLabel="Loading more posts" /> : null}
            ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
            renderItem={({ item }) => (
              <PostCard
                post={item}
                canDelete={!!user && canDeletePost(household.role, user.id, item.author.id)}
                liking={likingId === item.id}
                onToggleLike={() => void toggleLike(item)}
                onOpenPhoto={setViewing}
                onDelete={() => setDeleting(item)}
                onOpen={() => push({ pathname: '/households/[householdId]/posts/[postId]', params: { householdId, postId: item.id } })}
              />
            )}
          />
        )}
      </View>
      {!!household && (
        <FAB
          icon="pencil-outline"
          style={styles.fab}
          disabled={navigating}
          accessibilityLabel="Write a post"
          onPress={() => push({ pathname: '/posts/compose', params: { householdId } })}
        />
      )}
      <ImageViewer photo={viewing} canRemove={false} busy={false} onClose={() => setViewing(null)} onRemove={() => {}} />
      <AppDialog
        visible={!!deleting}
        onDismiss={() => setDeleting(null)}
        icon="trash-can-outline"
        title="Delete this post?"
        confirmLabel="Delete"
        onConfirm={() => { if (deleting) void deletePost(deleting); }}
      >
        Its photos, likes and comments will be deleted for everyone.
      </AppDialog>
      <Snackbar visible={!!notice} onDismiss={() => setNotice('')} duration={4000}>{notice}</Snackbar>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, width: '100%', maxWidth: 760, alignSelf: 'center' },
  selector: { flexGrow: 0 },
  households: { paddingHorizontal: 16, paddingTop: 10, gap: 8 },
  center: { flex: 1 },
  list: { padding: 16, paddingBottom: 96, flexGrow: 1 },
  footer: { paddingVertical: 16 },
  fab: { position: 'absolute', right: 16, bottom: 16 },
});
