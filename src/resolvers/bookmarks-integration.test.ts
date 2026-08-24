import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { createYoga, createSchema } from 'graphql-yoga';
import { typeDefs } from '../schema/typeDefs.ts';
import { resolvers } from './index.ts';
import { prisma } from '../db/client.ts';
import type { Folder, Bookmark } from '@prisma/client';

const yoga = createYoga({
  schema: createSchema({
    typeDefs,
    resolvers,
  }),
});

interface BookmarksQueryResponse {
  data?: {
    bookmarks?: {
      nodes: Array<{
        id: string;
        title: string;
        createdAt: string;
      }>;
      nextCursor: string | null;
      hasNextPage: boolean;
    } | null;
  } | null;
  errors?: Array<{
    message: string;
    extensions?: {
      code?: string;
    };
  }>;
}

describe('GraphQL Bookmarks PostgreSQL Integration Tests', () => {
  let folder: Folder;
  let bookmarkA: Bookmark;
  let bookmarkB: Bookmark;
  let bookmarkC: Bookmark;
  let bookmarkD: Bookmark;

  beforeAll(async () => {
    // 1. Create a parent test folder
    folder = await prisma.folder.create({
      data: { name: 'Integration Test Folder' },
    });

    // 2. Create test bookmarks
    // bookmarkA and bookmarkB will have identical createdAt timestamps to test deterministic sorting/tie-breaking.
    const identicalTime = new Date('2026-08-24T12:00:00Z');

    bookmarkA = await prisma.bookmark.create({
      data: {
        title: 'Apple',
        url: 'https://apple.com',
        folderId: folder.id,
        createdAt: identicalTime,
      },
    });

    bookmarkB = await prisma.bookmark.create({
      data: {
        title: 'Apricot',
        url: 'https://apricot.com',
        folderId: folder.id,
        createdAt: identicalTime,
      },
    });

    bookmarkC = await prisma.bookmark.create({
      data: {
        title: 'Banana',
        url: 'https://banana.com',
        folderId: folder.id,
        createdAt: new Date('2026-08-24T11:00:00Z'),
      },
    });

    bookmarkD = await prisma.bookmark.create({
      data: {
        title: 'Cherry',
        url: 'https://cherry.com',
        folderId: folder.id,
        createdAt: new Date('2026-08-24T10:00:00Z'),
      },
    });
  });

  afterAll(async () => {
    // Clean up all created integration test folders and bookmarks
    if (folder) {
      await prisma.bookmark.deleteMany({
        where: { folderId: folder.id },
      });
      await prisma.folder.delete({
        where: { id: folder.id },
      });
    }
  });

  it('performs multi-page cursor pagination and deterministic sorting through real database', async () => {
    // Determine expected ordering for the tie-breaker records bookmarkA and bookmarkB.
    // Order is: createdAt DESC, id DESC. Since they have the same createdAt, we compare their IDs.
    const tieBreaker = [bookmarkA, bookmarkB].sort((a, b) => b.id.localeCompare(a.id));
    const firstExpected = tieBreaker[0];
    const secondExpected = tieBreaker[1];
    if (!firstExpected || !secondExpected) {
      throw new Error('Tie breaker items not found');
    }

    // Page 1 request: take: 2 (no cursor)
    const response1 = await yoga.fetch('http://localhost/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          query GetPage1($folderId: ID!) {
            bookmarks(folderId: $folderId, take: 2) {
              nodes {
                id
                title
              }
              nextCursor
              hasNextPage
            }
          }
        `,
        variables: { folderId: folder.id },
      }),
    });

    expect(response1.status).toBe(200);
    const result1 = (await response1.json()) as BookmarksQueryResponse;
    expect(result1.errors).toBeUndefined();
    expect(result1.data?.bookmarks?.nodes).toHaveLength(2);
    
    // Assert actual values and order matching tie-breakers
    expect(result1.data?.bookmarks?.nodes?.[0]?.id).toBe(firstExpected.id);
    expect(result1.data?.bookmarks?.nodes?.[0]?.title).toBe(firstExpected.title);
    expect(result1.data?.bookmarks?.nodes?.[1]?.id).toBe(secondExpected.id);
    expect(result1.data?.bookmarks?.nodes?.[1]?.title).toBe(secondExpected.title);
    
    expect(result1.data?.bookmarks?.hasNextPage).toBe(true);
    const cursor = result1.data?.bookmarks?.nextCursor;
    expect(cursor).not.toBeNull();
    expect(typeof cursor).toBe('string');

    // Page 2 request: take: 2 (using cursor from Page 1)
    const response2 = await yoga.fetch('http://localhost/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          query GetPage2($folderId: ID!, $cursor: String!) {
            bookmarks(folderId: $folderId, take: 2, cursor: $cursor) {
              nodes {
                id
                title
              }
              nextCursor
              hasNextPage
            }
          }
        `,
        variables: { folderId: folder.id, cursor },
      }),
    });

    expect(response2.status).toBe(200);
    const result2 = (await response2.json()) as BookmarksQueryResponse;
    expect(result2.errors).toBeUndefined();
    expect(result2.data?.bookmarks?.nodes).toHaveLength(2);
    
    // Verify remainder order (bookmarkC and bookmarkD)
    expect(result2.data?.bookmarks?.nodes?.[0]?.id).toBe(bookmarkC.id);
    expect(result2.data?.bookmarks?.nodes?.[0]?.title).toBe('Banana');
    expect(result2.data?.bookmarks?.nodes?.[1]?.id).toBe(bookmarkD.id);
    expect(result2.data?.bookmarks?.nodes?.[1]?.title).toBe('Cherry');
    
    expect(result2.data?.bookmarks?.hasNextPage).toBe(false);
    expect(result2.data?.bookmarks?.nextCursor).toBeNull();
  });
});
