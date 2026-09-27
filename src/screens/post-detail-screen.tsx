import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { FlatList, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Divider, IconButton, Snackbar, Text, TextInput, useTheme } from 'react-native-paper';
import type { Photo } from '@/api/images';
import type { Post, PostComment } from '@/api/posts';
import AppShell, { goBack } from '@/components/app-shell';
import ImageViewer from '@/components/image-viewer';
import KeyboardAvoidingBody from '@/components/keyboard-avoiding-body';
import PostCard from '@/components/post-card';
import StatusMessage from '@/components/status-message';
import AppDialog from '@/components/ui/app-dialog';
import UserAvatar from '@/components/user-avatar';
import { fonts } from '@/constants/fonts';
import { errorMessage } from '@/lib/errors';
import { formatWhen } from '@/lib/notification-helpers';
import { canDeleteComment, canDeletePost, canSubmitComment, MAX_COMMENT_TEXT } from '@/lib/post-permissions';
import { useAuthStore } from '@/stores/auth-store';
import { useHouseholdStore } from '@/stores/household-store';
import { usePostStore } from '@/stores/post-store';

const LOAD_ERROR = 'Could not load this post.';

// One post with its comments, oldest first, and a box to add one. Reached from the feed or from a
// post notification, so the post is fetched here rather than trusted to be in the feed already.
export default function PostDetailScreen() {
  const { colors } = useTheme();
  const { householdId = '', postId = '' } = useLocalSearchParams<{ householdId?: string; postId?: string }>();
  const user = useAuthStore((state) => state.session?.user);
  const household = useHouseholdStore((state) => state.households?.find((row) => row.id === householdId));
  const comments = usePostStore((state) => state.commentsByPost[postId]);
  const [post, setPost] = useState<Post | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [liking, setLiking] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [viewing, setViewing] = useState<Photo | null>(null);
  const [deletingPost, setDeletingPost] = useState(false);
  const [deletingComment, setDeletingComment] = useState<PostComment | null>(null);

  // Fetched on every visit: the counts move while the person is elsewhere. The household list may
  // still be missing after a cold start from a notification, and it carries the person's role.
  useFocusEffect(useCallback(() => {
    setError('');
    useHouseholdStore.getState().loadHouseholds().catch(() => {});
    usePostStore.getState().loadPost(householdId, postId).then(setPost).catch((error: unknown) => setError(errorMessage(error, LOAD_ERROR)));
    usePostStore.getState().loadComments(householdId, postId).catch((error: unknown) => setError(errorMessage(error, LOAD_ERROR)));
  }, [householdId, postId]));

  async function loadMore() {
    if (loadingMore || !comments?.nextCursor) return;
    setLoadingMore(true);
    try { await usePostStore.getState().loadComments(householdId, postId, comments.nextCursor); }
    catch (error) { setNotice(errorMessage(error, 'Could not load more comments.')); }
    finally { setLoadingMore(false); }
  }

  async function toggleLike() {
    if (!post || liking) return;
    setLiking(true);
    try { setPost(await usePostStore.getState().setLike(householdId, post.id, !post.likedByMe)); }
    catch (error) { setNotice(errorMessage(error, 'Could not update the like.')); }
    finally { setLiking(false); }
  }

  async function send() {
    const text = draft.trim();
    if (!canSubmitComment(text) || sending) return;
    setSending(true);
    try {
      await usePostStore.getState().addComment(householdId, postId, text);
      setDraft('');
      setPost((current) => (current ? { ...current, commentCount: current.commentCount + 1 } : current));
    } catch (error) { setNotice(errorMessage(error, 'Could not add the comment.')); }
    finally { setSending(false); }
  }

  // Both run once the person confirms in the dialogs below.
  async function deletePost() {
    setDeletingPost(false);
    try {
      await usePostStore.getState().deletePost(householdId, postId);
      goBack();
    } catch (error) { setNotice(errorMessage(error, 'Could not delete the post.')); }
  }

  async function deleteComment(comment: PostComment) {
    setDeletingComment(null);
    try {
      await usePostStore.getState().deleteComment(householdId, postId, comment.id);
      setPost((current) => (current ? { ...current, commentCount: Math.max(0, current.commentCount - 1) } : current));
    } catch (error) { setNotice(errorMessage(error, 'Could not delete the comment.')); }
  }

  const role = household?.role;
  return (
    <AppShell title="Post" back>
      <KeyboardAvoidingBody>
        {!post ? (error ? <StatusMessage text={error} action="Go back" onAction={goBack} /> : <ActivityIndicator style={styles.flex} accessibilityLabel="Loading the post" />) : (
          <FlatList
            data={comments?.comments ?? []}
            keyExtractor={(comment) => comment.id}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              <View style={styles.header}>
                <PostCard
                  post={post}
                  canDelete={!!user && !!role && canDeletePost(role, user.id, post.author.id)}
                  liking={liking}
                  onToggleLike={() => void toggleLike()}
                  onOpenPhoto={setViewing}
                  onDelete={() => setDeletingPost(true)}
                />
                <Text variant="titleSmall" style={styles.commentsTitle}>Comments</Text>
                {!comments && <ActivityIndicator accessibilityLabel="Loading comments" />}
              </View>
            }
            ListEmptyComponent={comments ? <Text style={[styles.empty, { color: colors.onSurfaceVariant }]}>No comments yet. Be the first!</Text> : null}
            ListFooterComponent={comments?.nextCursor ? (
              <Button loading={loadingMore} disabled={loadingMore} onPress={() => void loadMore()}>Show more comments</Button>
            ) : null}
            ItemSeparatorComponent={() => <Divider style={styles.divider} />}
            renderItem={({ item }) => (
              <View style={styles.comment}>
                <UserAvatar name={item.author.name} url={item.author.avatarUrl} size={34} />
                <View style={styles.commentBody}>
                  <View style={styles.commentHead}>
                    <Text variant="titleSmall" style={styles.name} numberOfLines={1}>{item.author.name}</Text>
                    <Text variant="labelSmall" style={{ color: colors.onSurfaceVariant }}>{formatWhen(item.createdAt)}</Text>
                  </View>
                  <Text variant="bodyMedium">{item.text}</Text>
                </View>
                {!!user && !!role && canDeleteComment(role, user.id, item.author.id) && (
                  <IconButton icon="trash-can-outline" size={18} style={styles.commentDelete} accessibilityLabel={`Delete comment by ${item.author.name}`} onPress={() => setDeletingComment(item)} />
                )}
              </View>
            )}
          />
        )}
        {!!post && (
          <View style={[styles.composer, { backgroundColor: colors.elevation.level1, borderTopColor: colors.surfaceVariant }]}>
            <TextInput
              mode="outlined"
              placeholder="Add a comment"
              value={draft}
              onChangeText={setDraft}
              multiline
              maxLength={MAX_COMMENT_TEXT}
              style={styles.input}
              dense
              disabled={sending}
              accessibilityLabel="Comment text"
            />
            <IconButton
              icon="send"
              mode="contained"
              disabled={sending || !canSubmitComment(draft)}
              accessibilityLabel="Send comment"
              onPress={() => void send()}
            />
          </View>
        )}
      </KeyboardAvoidingBody>
      <ImageViewer photo={viewing} canRemove={false} busy={false} onClose={() => setViewing(null)} onRemove={() => {}} />
      <AppDialog
        visible={deletingPost}
        onDismiss={() => setDeletingPost(false)}
        icon="trash-can-outline"
        title="Delete this post?"
        confirmLabel="Delete"
        onConfirm={() => void deletePost()}
      >
        Its photos, likes and comments will be deleted for everyone.
      </AppDialog>
      <AppDialog
        visible={!!deletingComment}
        onDismiss={() => setDeletingComment(null)}
        icon="trash-can-outline"
        title="Delete this comment?"
        confirmLabel="Delete"
        onConfirm={() => { if (deletingComment) void deleteComment(deletingComment); }}
      >
        The comment will be removed for everyone.
      </AppDialog>
      <Snackbar visible={!!notice} onDismiss={() => setNotice('')} duration={4000}>{notice}</Snackbar>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: 16, paddingBottom: 24, flexGrow: 1, width: '100%', maxWidth: 760, alignSelf: 'center' },
  header: { gap: 12, marginBottom: 8 },
  commentsTitle: { fontFamily: fonts.semiBold, marginTop: 4 },
  empty: { paddingVertical: 12 },
  divider: { marginVertical: 8 },
  comment: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  commentBody: { flex: 1, gap: 2 },
  commentHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontFamily: fonts.semiBold, flexShrink: 1 },
  commentDelete: { margin: 0 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, maxHeight: 120 },
});
