import { uuidSchema } from '@paldora/validation';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PostCard } from '../../../components/post-card';
import { completedUser, apiClient, orNotFound } from '../../../lib/session';
import styles from '../../page-stack.module.css';

export const metadata = { title: 'Post' };

export default async function PostPage({
  params,
}: PageProps<'/posts/[postId]'>) {
  await completedUser();
  const id = uuidSchema.safeParse((await params).postId);
  if (!id.success) notFound();
  const post = await orNotFound((await apiClient()).post(id.data), [
    'POST_NOT_FOUND',
    'VALIDATION_FAILED',
  ]);
  return (
    <div className={styles.stack}>
      <p>
        <Link href={`/boxes/${post.box.id}`}>← {post.box.name}</Link>
      </p>
      <PostCard post={post} showBox leaveAfterDelete />
    </div>
  );
}
