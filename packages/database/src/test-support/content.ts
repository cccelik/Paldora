import {
  boxes,
  comments,
  lifeUpdateDeliveries,
  lifeUpdates,
  posts,
  type DatabaseTransaction,
  type PaldoraDatabase,
} from '../index.js';
import { createPerson, readyMediaAsset } from '../testing/index.js';

/**
 * Rows for the schema suites, written the way the services write them, so
 * each constraint can be exercised on its own. People have no profile, and
 * Boxes no members: the schema never needs them for these checks.
 */
export function contentFixtures(database: PaldoraDatabase) {
  const newUser = () =>
    createPerson(database, { label: 'schema', profile: false });

  async function newBox(name = 'Life') {
    const [box] = await database
      .insert(boxes)
      .values({ name })
      .returning({ id: boxes.id });
    if (!box) throw new Error('box insert failed');
    return box.id;
  }

  async function newPost(boxId: string, authorUserId: string) {
    const [post] = await database
      .insert(posts)
      .values({ boxId, authorUserId, content: 'hello' })
      .returning({ id: posts.id });
    if (!post) throw new Error('post insert failed');
    return post.id;
  }

  /** A Box with one post by `author`. */
  async function scene() {
    const author = await newUser();
    const boxId = await newBox('Schema');
    const postId = await newPost(boxId, author);
    return { author, boxId, postId };
  }

  async function newComment(
    postId: string,
    authorUserId: string,
    parentCommentId: string | null = null,
  ) {
    const [comment] = await database
      .insert(comments)
      .values({ postId, authorUserId, parentCommentId, content: 'nice' })
      .returning({ id: comments.id, depth: comments.depth });
    if (!comment) throw new Error('comment insert failed');
    return comment;
  }

  /** A processed image of `purpose`, 10×10. */
  async function image(
    ownerId: string,
    purpose: 'reaction_image' | 'life_update_image',
    boxId: string | null,
    status: 'ready' | 'deleted' = 'ready',
  ) {
    const { id } = await readyMediaAsset(database, {
      ownerId,
      purpose,
      boxId,
      status,
      width: 10,
      height: 10,
    });
    return id;
  }

  const reactionImage = (
    ownerUserId: string,
    boxId: string,
    status: 'ready' | 'deleted' = 'ready',
  ) => image(ownerUserId, 'reaction_image', boxId, status);

  const lifeUpdatePhoto = (ownerUserId: string, boxId: string | null) =>
    image(ownerUserId, 'life_update_image', boxId);

  return {
    newUser,
    newBox,
    newPost,
    scene,
    newComment,
    reactionImage,
    lifeUpdatePhoto,
  };
}

/** Life Update rows, written the way the publish service writes them. */
export function lifeUpdateFixtures(database: PaldoraDatabase) {
  async function insertUpdate(
    tx: DatabaseTransaction,
    authorUserId: string,
    audience: 'boxes' | 'only_me' = 'boxes',
    sections: Record<string, string> = { travel: 'Lisbon' },
  ) {
    const [update] = await tx
      .insert(lifeUpdates)
      .values({ authorUserId, audience, sections })
      .returning({ id: lifeUpdates.id });
    if (!update) throw new Error('life update insert failed');
    return update.id;
  }

  async function backingPost(
    tx: DatabaseTransaction,
    boxId: string,
    authorUserId: string,
  ) {
    const [post] = await tx
      .insert(posts)
      .values({ boxId, authorUserId, kind: 'life_update' })
      .returning({ id: posts.id });
    if (!post) throw new Error('backing post insert failed');
    return post.id;
  }

  /** A Life Update delivered to each Box, the way the publish service writes it. */
  async function publish(author: string, boxIds: readonly string[]) {
    return database.transaction(async (tx) => {
      const lifeUpdateId = await insertUpdate(tx, author);
      const postIds: string[] = [];
      for (const [position, boxId] of boxIds.entries()) {
        // Sequential on one transaction connection.
        // eslint-disable-next-line no-await-in-loop
        const postId = await backingPost(tx, boxId, author);
        // eslint-disable-next-line no-await-in-loop
        await tx.insert(lifeUpdateDeliveries).values({
          lifeUpdateId,
          audience: 'boxes',
          authorUserId: author,
          position,
          boxId,
          postId,
        });
        postIds.push(postId);
      }
      return { lifeUpdateId, postIds };
    });
  }

  async function publishOnlyMe(author: string) {
    return database.transaction(async (tx) => {
      const lifeUpdateId = await insertUpdate(tx, author, 'only_me');
      await tx.insert(lifeUpdateDeliveries).values({
        lifeUpdateId,
        audience: 'only_me',
        authorUserId: author,
        position: 0,
      });
      return lifeUpdateId;
    });
  }

  return { insertUpdate, backingPost, publish, publishOnlyMe };
}

/** Raised by the Life Update audience triggers. */
export const IMMUTABLE = 'life_update_audience_immutable';
