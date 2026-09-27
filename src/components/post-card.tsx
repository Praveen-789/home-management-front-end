import { StyleSheet, View } from 'react-native';
import { Icon, IconButton, Text, TouchableRipple, useTheme } from 'react-native-paper';
import type { Photo } from '@/api/images';
import type { Post } from '@/api/posts';
import UserAvatar from '@/components/user-avatar';
import PostPhotos from '@/components/post-photos';
import { fonts } from '@/constants/fonts';
import { formatWhen } from '@/lib/notification-helpers';

type Props = {
  post: Post;
  // Whether the signed-in person may delete this post: its author, or an owner or admin.
  canDelete: boolean;
  // Disables the like button while a like request is in flight, so taps cannot race.
  liking: boolean;
  onToggleLike: () => void;
  onOpenPhoto: (photo: Photo) => void;
  onDelete: () => void;
  // Set on the feed: opens the post's own screen. The detail screen leaves it out.
  onOpen?: () => void;
};

// One post, as the feed and the post's own screen show it: who and when, the text, the photos,
// and the like and comment counts.
export default function PostCard({ post, canDelete, liking, onToggleLike, onOpenPhoto, onDelete, onOpen }: Props) {
  const { colors } = useTheme();
  const comments = `${post.commentCount} ${post.commentCount === 1 ? 'comment' : 'comments'}`;

  const body = (
    <View style={styles.body}>
      <View style={styles.header}>
        <UserAvatar name={post.author.name} url={post.author.avatarUrl} size={40} />
        <View style={styles.identity}>
          <Text variant="titleSmall" style={styles.name} numberOfLines={1}>{post.author.name}</Text>
          <Text variant="labelSmall" style={{ color: colors.onSurfaceVariant }}>{formatWhen(post.createdAt)}</Text>
        </View>
        {canDelete && <IconButton icon="trash-can-outline" size={20} accessibilityLabel="Delete post" onPress={onDelete} />}
      </View>
      {!!post.text && <Text variant="bodyLarge" style={styles.text} onPress={onOpen}>{post.text}</Text>}
      <PostPhotos key={post.images.map((photo) => photo.id).join(',')} photos={post.images} onOpen={onOpenPhoto} />
      <View style={styles.footer}>
        <View style={styles.count}>
          <IconButton
            icon={post.likedByMe ? 'heart' : 'heart-outline'}
            iconColor={post.likedByMe ? colors.error : colors.onSurfaceVariant}
            size={22}
            disabled={liking}
            accessibilityLabel={post.likedByMe ? `Unlike, ${post.likeCount} likes` : `Like, ${post.likeCount} likes`}
            onPress={onToggleLike}
            style={styles.action}
          />
          <Text variant="labelLarge" style={{ color: colors.onSurfaceVariant }}>{post.likeCount}</Text>
        </View>
        <TouchableRipple onPress={onOpen} disabled={!onOpen} accessibilityRole="button" accessibilityLabel={comments} style={styles.commentAction}>
          <View style={styles.count}>
            <Icon source="comment-outline" size={20} color={colors.onSurfaceVariant} />
            <Text variant="labelLarge" style={{ color: colors.onSurfaceVariant }}>{comments}</Text>
          </View>
        </TouchableRipple>
      </View>
    </View>
  );

  return <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.outlineVariant }]}>{body}</View>;
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, borderWidth: 1 },
  body: { padding: 14, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  identity: { flex: 1, gap: 1 },
  name: { fontFamily: fonts.semiBold },
  text: { lineHeight: 22 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  count: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  action: { margin: 0 },
  commentAction: { borderRadius: 20, minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
});
