import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { createYoga, createSchema } from 'graphql-yoga';
import { typeDefs } from '../schema/typeDefs.ts';
import { resolvers } from './index.ts';
import { ValidationError, NotFoundError, decodeCursor, encodeCursor } from '../validation/index.ts';

interface FolderMock {
  id: string;
  name: string;
  createdAt: Date;
}

interface BookmarkMock {
  id: string;
  title: string;
  url: string;
  tags: string[];
  folderId: string;
  createdAt: Date;
}

interface BookmarkConnectionMock {
  nodes: BookmarkMock[];
  nextCursor: string | null;
  hasNextPage: boolean;
}

interface GlobalWithMocks {
  mockFolderService?: {
    getFolders: () => Promise<FolderMock[]>;
    getFolderById: (id: string) => Promise<FolderMock | null>;
    createFolder: (name: string) => Promise<FolderMock>;
    getBookmarksForFolder: (folderId: string) => Promise<BookmarkMock[]>;
  };
  mockBookmarkService?: {
    createBookmark: (input: { title: string; url: string; folderId: string; tags?: string[] | null }) => Promise<BookmarkMock>;
    updateBookmark: (id: string, input: { title?: string | null; url?: string | null; tags?: string[] | null }) => Promise<BookmarkMock>;
    deleteBookmark: (id: string) => Promise<BookmarkMock>;
    moveBookmark: (id: string, folderId: string) => Promise<BookmarkMock>;
    getBookmarksPaginated: (args: { folderId?: string | null; search?: string | null; take?: number | null; cursor?: string | null }) => Promise<BookmarkConnectionMock>;
  };
}

const mockFolders = [
  { id: 'folder-1', name: 'Folder 1', createdAt: new Date('2026-08-24T10:00:00Z') },
  { id: 'folder-2', name: 'Folder 2', createdAt: new Date('2026-08-24T11:00:00Z') },
];

const mockBookmarks = [
  { id: 'bookmark-1', title: 'Google', url: 'https://google.com', tags: ['search'], folderId: 'folder-1', createdAt: new Date('2026-08-24T10:00:00Z') },
  { id: 'bookmark-2', title: 'GitHub', url: 'https://github.com', tags: ['git'], folderId: 'folder-1', createdAt: new Date('2026-08-24T10:00:00Z') }, // Same timestamp as bookmark-1
  { id: 'bookmark-3', title: 'Apple', url: 'https://apple.com', tags: ['tech'], folderId: 'folder-1', createdAt: new Date('2026-08-24T09:00:00Z') },
  { id: 'bookmark-4', title: 'Apricot', url: 'https://apricot.com', tags: ['fruit'], folderId: 'folder-2', createdAt: new Date('2026-08-24T08:00:00Z') },
  { id: 'bookmark-5', title: 'Banana', url: 'https://banana.com', tags: ['fruit'], folderId: 'folder-2', createdAt: new Date('2026-08-24T07:00:00Z') },
];

beforeAll(() => {
  const g = globalThis as unknown as GlobalWithMocks;

  g.mockFolderService = {
    getFolders: async () => mockFolders,
    getFolderById: async (id: string) => {
      const folder = mockFolders.find(f => f.id === id);
      return folder || null;
    },
    createFolder: async (name: string) => {
      return { id: 'folder-new', name, createdAt: new Date('2026-08-24T12:00:00Z') };
    },
    getBookmarksForFolder: async (folderId: string) => {
      return mockBookmarks.filter(b => b.folderId === folderId);
    },
  };

  g.mockBookmarkService = {
    createBookmark: async (input: { title: string; url: string; folderId: string; tags?: string[] | null }) => {
      const trimmedTitle = input.title.trim();
      if (!trimmedTitle) {
        throw new ValidationError('Bookmark title cannot be empty or whitespace only');
      }

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(input.url.trim());
      } catch {
        throw new ValidationError('Invalid URL format');
      }
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        throw new ValidationError('Bookmark URL must use http or https');
      }

      if (!mockFolders.some(f => f.id === input.folderId)) {
        throw new NotFoundError(`Destination folder with ID "${input.folderId}" not found`);
      }

      return {
        id: 'bookmark-new',
        title: trimmedTitle,
        url: input.url.trim(),
        tags: input.tags || [],
        folderId: input.folderId,
        createdAt: new Date('2026-08-24T12:00:00Z'),
      };
    },
    updateBookmark: async (id: string, input: { title?: string | null; url?: string | null; tags?: string[] | null }) => {
      const bookmark = mockBookmarks.find(b => b.id === id);
      if (!bookmark) {
        throw new NotFoundError(`Bookmark with ID "${id}" not found`);
      }

      const updated = { ...bookmark };

      if (input.title !== undefined && input.title !== null) {
        const trimmedTitle = input.title.trim();
        if (!trimmedTitle) {
          throw new ValidationError('Bookmark title cannot be empty or whitespace only');
        }
        updated.title = trimmedTitle;
      }

      if (input.url !== undefined && input.url !== null) {
        let parsedUrl: URL;
        try {
          parsedUrl = new URL(input.url.trim());
        } catch {
          throw new ValidationError('Invalid URL format');
        }
        if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
          throw new ValidationError('Bookmark URL must use http or https');
        }
        updated.url = input.url.trim();
      }

      if (input.tags !== undefined && input.tags !== null) {
        updated.tags = input.tags;
      }

      return updated;
    },
    deleteBookmark: async (id: string) => {
      const bookmark = mockBookmarks.find(b => b.id === id);
      if (!bookmark) {
        throw new NotFoundError(`Bookmark with ID "${id}" not found`);
      }
      return bookmark;
    },
    moveBookmark: async (id: string, folderId: string) => {
      const bookmark = mockBookmarks.find(b => b.id === id);
      if (!bookmark) {
        throw new NotFoundError(`Bookmark with ID "${id}" not found`);
      }

      const folder = mockFolders.find(f => f.id === folderId);
      if (!folder) {
        throw new NotFoundError(`Destination folder with ID "${folderId}" not found`);
      }

      return {
        ...bookmark,
        folderId,
      };
    },
    getBookmarksPaginated: async (args: { folderId?: string | null; search?: string | null; take?: number | null; cursor?: string | null }) => {
      const take = args.take ?? 20;
      if (take <= 0 || take > 100) {
        throw new ValidationError('take parameter must be greater than 0 and less than or equal to 100');
      }

      let decoded: { createdAt: Date; id: string } | null = null;
      if (args.cursor) {
        decoded = decodeCursor(args.cursor);
      }

      let filtered = [...mockBookmarks];
      if (args.folderId) {
        filtered = filtered.filter(b => b.folderId === args.folderId);
      }
      if (args.search?.trim()) {
        const q = args.search.trim().toLowerCase();
        filtered = filtered.filter(b => b.title.toLowerCase().includes(q));
      }

      // Sort by createdAt DESC, id DESC
      filtered.sort((a, b) => {
        const timeDiff = b.createdAt.getTime() - a.createdAt.getTime();
        if (timeDiff !== 0) return timeDiff;
        return b.id.localeCompare(a.id);
      });

      if (decoded) {
        const cursorTime = decoded.createdAt.getTime();
        const cursorId = decoded.id;
        filtered = filtered.filter(b => {
          const t = b.createdAt.getTime();
          if (t < cursorTime) return true;
          if (t === cursorTime) return b.id < cursorId;
          return false;
        });
      }

      const hasNextPage = filtered.length > take;
      const nodes = hasNextPage ? filtered.slice(0, take) : filtered;

      let nextCursor: string | null = null;
      if (nodes.length > 0 && hasNextPage) {
        const lastNode = nodes[nodes.length - 1];
        if (lastNode) {
          nextCursor = encodeCursor(lastNode.createdAt, lastNode.id);
        }
      }

      return {
        nodes,
        nextCursor,
        hasNextPage,
      };
    },
  };
});

afterAll(() => {
  const g = globalThis as unknown as Record<string, unknown>;
  delete g.mockFolderService;
  delete g.mockBookmarkService;
});

const yoga = createYoga({
  schema: createSchema({
    typeDefs,
    resolvers,
  }),
});

interface CreateBookmarkResponse {
  data?: {
    createBookmark?: {
      id: string;
      title: string;
      url: string;
      tags: string[];
      folderId: string;
      folder: {
        id: string;
        name: string;
      };
    } | null;
  } | null;
  errors?: Array<{
    message: string;
    extensions?: {
      code?: string;
    };
  }>;
}

interface UpdateBookmarkResponse {
  data?: {
    updateBookmark?: {
      id: string;
      title: string;
      url: string;
      tags: string[];
    } | null;
  } | null;
  errors?: Array<{
    message: string;
    extensions?: {
      code?: string;
    };
  }>;
}

interface DeleteBookmarkResponse {
  data?: {
    deleteBookmark?: {
      id: string;
      title: string;
    } | null;
  } | null;
  errors?: Array<{
    message: string;
    extensions?: {
      code?: string;
    };
  }>;
}

interface MoveBookmarkResponse {
  data?: {
    moveBookmark?: {
      id: string;
      folderId: string;
      folder: {
        id: string;
        name: string;
      };
    } | null;
  } | null;
  errors?: Array<{
    message: string;
    extensions?: {
      code?: string;
    };
  }>;
}

interface ErrorOnlyResponse {
  data?: null;
  errors?: Array<{
    message: string;
    extensions?: {
      code?: string;
    };
  }>;
}

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

describe('GraphQL Bookmark Resolvers', () => {
  it('createBookmark successfully creates a bookmark', async () => {
    const response = await yoga.fetch('http://localhost/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          mutation CreateBookmark($input: CreateBookmarkInput!) {
            createBookmark(input: $input) {
              id
              title
              url
              tags
              folderId
              folder {
                id
                name
              }
            }
          }
        `,
        variables: {
          input: {
            title: 'GitHub',
            url: 'https://github.com',
            folderId: 'folder-1',
            tags: ['dev', 'git'],
          },
        },
      }),
    });

    expect(response.status).toBe(200);
    const result = (await response.json()) as CreateBookmarkResponse;
    expect(result.errors).toBeUndefined();
    expect(result.data?.createBookmark).toBeDefined();
    expect(result.data?.createBookmark?.id).toBe('bookmark-new');
    expect(result.data?.createBookmark?.title).toBe('GitHub');
    expect(result.data?.createBookmark?.url).toBe('https://github.com');
    expect(result.data?.createBookmark?.tags).toEqual(['dev', 'git']);
    expect(result.data?.createBookmark?.folderId).toBe('folder-1');
    expect(result.data?.createBookmark?.folder?.id).toBe('folder-1');
    expect(result.data?.createBookmark?.folder?.name).toBe('Folder 1');
  });

  it('createBookmark rejects whitespace-only title', async () => {
    const response = await yoga.fetch('http://localhost/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          mutation CreateBookmark($input: CreateBookmarkInput!) {
            createBookmark(input: $input) {
              id
              title
            }
          }
        `,
        variables: {
          input: {
            title: '   ',
            url: 'https://github.com',
            folderId: 'folder-1',
          },
        },
      }),
    });

    expect(response.status).toBe(200);
    const result = (await response.json()) as ErrorOnlyResponse;
    expect(result.data).toBeNull();
    expect(result.errors).toBeDefined();
    expect(result.errors).toHaveLength(1);
    expect(result.errors?.[0]?.message).toBe('Bookmark title cannot be empty or whitespace only');
    expect(result.errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT');
  });

  it('createBookmark rejects malformed URL', async () => {
    const response = await yoga.fetch('http://localhost/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          mutation CreateBookmark($input: CreateBookmarkInput!) {
            createBookmark(input: $input) {
              id
              title
            }
          }
        `,
        variables: {
          input: {
            title: 'GitHub',
            url: 'not-a-valid-url',
            folderId: 'folder-1',
          },
        },
      }),
    });

    expect(response.status).toBe(200);
    const result = (await response.json()) as ErrorOnlyResponse;
    expect(result.data).toBeNull();
    expect(result.errors).toBeDefined();
    expect(result.errors).toHaveLength(1);
    expect(result.errors?.[0]?.message).toBe('Invalid URL format');
    expect(result.errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT');
  });

  it('createBookmark rejects non-http/https URL protocols', async () => {
    const response = await yoga.fetch('http://localhost/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          mutation CreateBookmark($input: CreateBookmarkInput!) {
            createBookmark(input: $input) {
              id
              title
            }
          }
        `,
        variables: {
          input: {
            title: 'Mail',
            url: 'mailto:test@example.com',
            folderId: 'folder-1',
          },
        },
      }),
    });

    expect(response.status).toBe(200);
    const result = (await response.json()) as ErrorOnlyResponse;
    expect(result.data).toBeNull();
    expect(result.errors).toBeDefined();
    expect(result.errors).toHaveLength(1);
    expect(result.errors?.[0]?.message).toBe('Bookmark URL must use http or https');
    expect(result.errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT');
  });

  it('createBookmark rejects a non-existent folder', async () => {
    const response = await yoga.fetch('http://localhost/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          mutation CreateBookmark($input: CreateBookmarkInput!) {
            createBookmark(input: $input) {
              id
              title
            }
          }
        `,
        variables: {
          input: {
            title: 'GitHub',
            url: 'https://github.com',
            folderId: 'non-existent-folder',
          },
        },
      }),
    });

    expect(response.status).toBe(200);
    const result = (await response.json()) as ErrorOnlyResponse;
    expect(result.data).toBeNull();
    expect(result.errors).toBeDefined();
    expect(result.errors).toHaveLength(1);
    expect(result.errors?.[0]?.message).toBe('Destination folder with ID "non-existent-folder" not found');
    expect(result.errors?.[0]?.extensions?.code).toBe('NOT_FOUND');
  });

  it('updateBookmark successfully updates provided fields', async () => {
    const response = await yoga.fetch('http://localhost/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          mutation UpdateBookmark($id: ID!, $input: UpdateBookmarkInput!) {
            updateBookmark(id: $id, input: $input) {
              id
              title
              url
              tags
            }
          }
        `,
        variables: {
          id: 'bookmark-1',
          input: {
            title: 'Google Updated',
            url: 'https://google.com/updated',
            tags: ['search', 'web'],
          },
        },
      }),
    });

    expect(response.status).toBe(200);
    const result = (await response.json()) as UpdateBookmarkResponse;
    expect(result.errors).toBeUndefined();
    expect(result.data?.updateBookmark).toBeDefined();
    expect(result.data?.updateBookmark?.id).toBe('bookmark-1');
    expect(result.data?.updateBookmark?.title).toBe('Google Updated');
    expect(result.data?.updateBookmark?.url).toBe('https://google.com/updated');
    expect(result.data?.updateBookmark?.tags).toEqual(['search', 'web']);
  });

  it('updateBookmark rejects invalid title/URL', async () => {
    // Test invalid title
    let response = await yoga.fetch('http://localhost/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          mutation UpdateBookmark($id: ID!, $input: UpdateBookmarkInput!) {
            updateBookmark(id: $id, input: $input) {
              id
            }
          }
        `,
        variables: {
          id: 'bookmark-1',
          input: { title: '   ' },
        },
      }),
    });
    expect(response.status).toBe(200);
    let result = (await response.json()) as ErrorOnlyResponse;
    expect(result.data).toBeNull();
    expect(result.errors).toBeDefined();
    expect(result.errors?.[0]?.message).toBe('Bookmark title cannot be empty or whitespace only');
    expect(result.errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT');

    // Test invalid URL
    response = await yoga.fetch('http://localhost/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          mutation UpdateBookmark($id: ID!, $input: UpdateBookmarkInput!) {
            updateBookmark(id: $id, input: $input) {
              id
            }
          }
        `,
        variables: {
          id: 'bookmark-1',
          input: { url: 'ftp://not-web-url.com' },
        },
      }),
    });
    expect(response.status).toBe(200);
    result = (await response.json()) as ErrorOnlyResponse;
    expect(result.data).toBeNull();
    expect(result.errors).toBeDefined();
    expect(result.errors?.[0]?.message).toBe('Bookmark URL must use http or https');
    expect(result.errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT');
  });

  it('updateBookmark returns a meaningful error for a missing bookmark', async () => {
    const response = await yoga.fetch('http://localhost/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          mutation UpdateBookmark($id: ID!, $input: UpdateBookmarkInput!) {
            updateBookmark(id: $id, input: $input) {
              id
            }
          }
        `,
        variables: {
          id: 'non-existent-bookmark',
          input: { title: 'New Title' },
        },
      }),
    });

    expect(response.status).toBe(200);
    const result = (await response.json()) as ErrorOnlyResponse;
    expect(result.data).toBeNull();
    expect(result.errors).toBeDefined();
    expect(result.errors).toHaveLength(1);
    expect(result.errors?.[0]?.message).toBe('Bookmark with ID "non-existent-bookmark" not found');
    expect(result.errors?.[0]?.extensions?.code).toBe('NOT_FOUND');
  });

  it('deleteBookmark successfully deletes and returns the bookmark', async () => {
    const response = await yoga.fetch('http://localhost/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          mutation DeleteBookmark($id: ID!) {
            deleteBookmark(id: $id) {
              id
              title
            }
          }
        `,
        variables: { id: 'bookmark-1' },
      }),
    });

    expect(response.status).toBe(200);
    const result = (await response.json()) as DeleteBookmarkResponse;
    expect(result.errors).toBeUndefined();
    expect(result.data?.deleteBookmark).toBeDefined();
    expect(result.data?.deleteBookmark?.id).toBe('bookmark-1');
    expect(result.data?.deleteBookmark?.title).toBe('Google');
  });

  it('deleteBookmark returns a meaningful error for a missing bookmark', async () => {
    const response = await yoga.fetch('http://localhost/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          mutation DeleteBookmark($id: ID!) {
            deleteBookmark(id: $id) {
              id
            }
          }
        `,
        variables: { id: 'non-existent-bookmark' },
      }),
    });

    expect(response.status).toBe(200);
    const result = (await response.json()) as ErrorOnlyResponse;
    expect(result.data).toBeNull();
    expect(result.errors).toBeDefined();
    expect(result.errors).toHaveLength(1);
    expect(result.errors?.[0]?.message).toBe('Bookmark with ID "non-existent-bookmark" not found');
    expect(result.errors?.[0]?.extensions?.code).toBe('NOT_FOUND');
  });

  it('moveBookmark successfully moves a bookmark to another folder', async () => {
    const response = await yoga.fetch('http://localhost/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          mutation MoveBookmark($id: ID!, $folderId: ID!) {
            moveBookmark(id: $id, folderId: $folderId) {
              id
              folderId
              folder {
                id
                name
              }
            }
          }
        `,
        variables: { id: 'bookmark-1', folderId: 'folder-2' },
      }),
    });

    expect(response.status).toBe(200);
    const result = (await response.json()) as MoveBookmarkResponse;
    expect(result.errors).toBeUndefined();
    expect(result.data?.moveBookmark).toBeDefined();
    expect(result.data?.moveBookmark?.id).toBe('bookmark-1');
    expect(result.data?.moveBookmark?.folderId).toBe('folder-2');
    expect(result.data?.moveBookmark?.folder?.id).toBe('folder-2');
    expect(result.data?.moveBookmark?.folder?.name).toBe('Folder 2');
  });

  it('moveBookmark rejects a non-existent bookmark', async () => {
    const response = await yoga.fetch('http://localhost/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          mutation MoveBookmark($id: ID!, $folderId: ID!) {
            moveBookmark(id: $id, folderId: $folderId) {
              id
            }
          }
        `,
        variables: { id: 'non-existent-bookmark', folderId: 'folder-2' },
      }),
    });

    expect(response.status).toBe(200);
    const result = (await response.json()) as ErrorOnlyResponse;
    expect(result.data).toBeNull();
    expect(result.errors).toBeDefined();
    expect(result.errors).toHaveLength(1);
    expect(result.errors?.[0]?.message).toBe('Bookmark with ID "non-existent-bookmark" not found');
    expect(result.errors?.[0]?.extensions?.code).toBe('NOT_FOUND');
  });

  it('moveBookmark rejects a non-existent destination folder', async () => {
    const response = await yoga.fetch('http://localhost/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          mutation MoveBookmark($id: ID!, $folderId: ID!) {
            moveBookmark(id: $id, folderId: $folderId) {
              id
            }
          }
        `,
        variables: { id: 'bookmark-1', folderId: 'non-existent-folder' },
      }),
    });

    expect(response.status).toBe(200);
    const result = (await response.json()) as ErrorOnlyResponse;
    expect(result.data).toBeNull();
    expect(result.errors).toBeDefined();
    expect(result.errors).toHaveLength(1);
    expect(result.errors?.[0]?.message).toBe('Destination folder with ID "non-existent-folder" not found');
    expect(result.errors?.[0]?.extensions?.code).toBe('NOT_FOUND');
  });

  // --- STAGE 6 SEARCH & PAGINATION TESTS ---

  it('bookmarks query returns results sorted by createdAt DESC, id DESC', async () => {
    const response = await yoga.fetch('http://localhost/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          query {
            bookmarks {
              nodes {
                id
                title
              }
              nextCursor
              hasNextPage
            }
          }
        `,
      }),
    });

    expect(response.status).toBe(200);
    const result = (await response.json()) as BookmarksQueryResponse;
    expect(result.errors).toBeUndefined();
    expect(result.data?.bookmarks?.nodes).toHaveLength(5);
    expect(result.data?.bookmarks?.nodes?.[0]?.id).toBe('bookmark-2');
    expect(result.data?.bookmarks?.nodes?.[1]?.id).toBe('bookmark-1');
    expect(result.data?.bookmarks?.nodes?.[2]?.id).toBe('bookmark-3');
    expect(result.data?.bookmarks?.nodes?.[3]?.id).toBe('bookmark-4');
    expect(result.data?.bookmarks?.nodes?.[4]?.id).toBe('bookmark-5');
    expect(result.data?.bookmarks?.hasNextPage).toBe(false);
    expect(result.data?.bookmarks?.nextCursor).toBeNull();
  });

  it('bookmarks query filters by folderId', async () => {
    const response = await yoga.fetch('http://localhost/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          query GetFolderBookmarks($folderId: ID!) {
            bookmarks(folderId: $folderId) {
              nodes {
                id
                title
              }
            }
          }
        `,
        variables: { folderId: 'folder-2' },
      }),
    });

    expect(response.status).toBe(200);
    const result = (await response.json()) as BookmarksQueryResponse;
    expect(result.errors).toBeUndefined();
    expect(result.data?.bookmarks?.nodes).toHaveLength(2);
    expect(result.data?.bookmarks?.nodes?.[0]?.id).toBe('bookmark-4');
    expect(result.data?.bookmarks?.nodes?.[1]?.id).toBe('bookmark-5');
  });

  it('bookmarks query performs case-insensitive substring search', async () => {
    const response = await yoga.fetch('http://localhost/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          query SearchBookmarks($search: String!) {
            bookmarks(search: $search) {
              nodes {
                id
                title
              }
            }
          }
        `,
        variables: { search: 'gOoG' },
      }),
    });

    expect(response.status).toBe(200);
    const result = (await response.json()) as BookmarksQueryResponse;
    expect(result.errors).toBeUndefined();
    expect(result.data?.bookmarks?.nodes).toHaveLength(1);
    expect(result.data?.bookmarks?.nodes?.[0]?.id).toBe('bookmark-1');
  });

  it('bookmarks query search + folderId filter works together', async () => {
    const response = await yoga.fetch('http://localhost/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          query SearchFolder($folderId: ID!, $search: String!) {
            bookmarks(folderId: $folderId, search: $search) {
              nodes {
                id
                title
              }
            }
          }
        `,
        variables: { folderId: 'folder-2', search: 'an' },
      }),
    });

    expect(response.status).toBe(200);
    const result = (await response.json()) as BookmarksQueryResponse;
    expect(result.errors).toBeUndefined();
    expect(result.data?.bookmarks?.nodes).toHaveLength(1);
    expect(result.data?.bookmarks?.nodes?.[0]?.id).toBe('bookmark-5');
  });

  it('bookmarks query handles empty/whitespace search correctly', async () => {
    const response = await yoga.fetch('http://localhost/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          query {
            bookmarks(search: "   ") {
              nodes {
                id
              }
            }
          }
        `,
      }),
    });

    expect(response.status).toBe(200);
    const result = (await response.json()) as BookmarksQueryResponse;
    expect(result.errors).toBeUndefined();
    expect(result.data?.bookmarks?.nodes).toHaveLength(5);
  });

  it('bookmarks query default take and custom take works', async () => {
    const response = await yoga.fetch('http://localhost/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          query {
            bookmarks(take: 2) {
              nodes {
                id
              }
              hasNextPage
              nextCursor
            }
          }
        `,
      }),
    });

    expect(response.status).toBe(200);
    const result = (await response.json()) as BookmarksQueryResponse;
    expect(result.errors).toBeUndefined();
    expect(result.data?.bookmarks?.nodes).toHaveLength(2);
    expect(result.data?.bookmarks?.hasNextPage).toBe(true);
    expect(result.data?.bookmarks?.nextCursor).not.toBeNull();
  });

  it('bookmarks query validates invalid take parameters', async () => {
    let response = await yoga.fetch('http://localhost/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          query {
            bookmarks(take: 0) {
              nodes { id }
            }
          }
        `,
      }),
    });
    expect(response.status).toBe(200);
    let result = (await response.json()) as ErrorOnlyResponse;
    expect(result.data).toBeNull();
    expect(result.errors?.[0]?.message).toBe('take parameter must be greater than 0 and less than or equal to 100');
    expect(result.errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT');

    response = await yoga.fetch('http://localhost/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          query {
            bookmarks(take: 101) {
              nodes { id }
            }
          }
        `,
      }),
    });
    expect(response.status).toBe(200);
    result = (await response.json()) as ErrorOnlyResponse;
    expect(result.data).toBeNull();
    expect(result.errors?.[0]?.message).toBe('take parameter must be greater than 0 and less than or equal to 100');
    expect(result.errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT');
  });

  it('bookmarks query validates invalid/malformed cursors', async () => {
    let response = await yoga.fetch('http://localhost/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          query {
            bookmarks(cursor: "not-base64-!") {
              nodes { id }
            }
          }
        `,
      }),
    });
    expect(response.status).toBe(200);
    let result = (await response.json()) as ErrorOnlyResponse;
    expect(result.data).toBeNull();
    expect(result.errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT');

    const badJsonBase64 = Buffer.from('{ bad json }', 'utf-8').toString('base64');
    response = await yoga.fetch('http://localhost/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          query GetB($cursor: String!) {
            bookmarks(cursor: $cursor) {
              nodes { id }
            }
          }
        `,
        variables: { cursor: badJsonBase64 },
      }),
    });
    expect(response.status).toBe(200);
    result = (await response.json()) as ErrorOnlyResponse;
    expect(result.data).toBeNull();
    expect(result.errors?.[0]?.message).toBe('Invalid cursor: malformed JSON payload');
    expect(result.errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT');

    const badDateBase64 = Buffer.from(JSON.stringify({ createdAt: 'not-a-date', id: 'some-id' }), 'utf-8').toString('base64');
    response = await yoga.fetch('http://localhost/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          query GetB($cursor: String!) {
            bookmarks(cursor: $cursor) {
              nodes { id }
            }
          }
        `,
        variables: { cursor: badDateBase64 },
      }),
    });
    expect(response.status).toBe(200);
    result = (await response.json()) as ErrorOnlyResponse;
    expect(result.data).toBeNull();
    expect(result.errors?.[0]?.message).toBe('Invalid cursor: creation date is not a valid date');
    expect(result.errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT');

    const badIdBase64 = Buffer.from(JSON.stringify({ createdAt: new Date().toISOString(), id: '  ' }), 'utf-8').toString('base64');
    response = await yoga.fetch('http://localhost/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          query GetB($cursor: String!) {
            bookmarks(cursor: $cursor) {
              nodes { id }
            }
          }
        `,
        variables: { cursor: badIdBase64 },
      }),
    });
    expect(response.status).toBe(200);
    result = (await response.json()) as ErrorOnlyResponse;
    expect(result.data).toBeNull();
    expect(result.errors?.[0]?.message).toBe('Invalid cursor: missing or empty bookmark ID');
    expect(result.errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT');
  });

  it('bookmarks query performs sequential multi-page cursor-based pagination successfully', async () => {
    let response = await yoga.fetch('http://localhost/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          query {
            bookmarks(take: 2) {
              nodes { id title }
              nextCursor
              hasNextPage
            }
          }
        `,
      }),
    });
    let result = (await response.json()) as BookmarksQueryResponse;
    expect(result.errors).toBeUndefined();
    expect(result.data?.bookmarks?.nodes).toHaveLength(2);
    expect(result.data?.bookmarks?.nodes?.[0]?.id).toBe('bookmark-2');
    expect(result.data?.bookmarks?.nodes?.[1]?.id).toBe('bookmark-1');
    expect(result.data?.bookmarks?.hasNextPage).toBe(true);
    const cursor1 = result.data?.bookmarks?.nextCursor;
    expect(cursor1).not.toBeNull();

    response = await yoga.fetch('http://localhost/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          query GetP2($cursor: String!) {
            bookmarks(take: 2, cursor: $cursor) {
              nodes { id title }
              nextCursor
              hasNextPage
            }
          }
        `,
        variables: { cursor: cursor1 },
      }),
    });
    result = (await response.json()) as BookmarksQueryResponse;
    expect(result.errors).toBeUndefined();
    expect(result.data?.bookmarks?.nodes).toHaveLength(2);
    expect(result.data?.bookmarks?.nodes?.[0]?.id).toBe('bookmark-3');
    expect(result.data?.bookmarks?.nodes?.[1]?.id).toBe('bookmark-4');
    expect(result.data?.bookmarks?.hasNextPage).toBe(true);
    const cursor2 = result.data?.bookmarks?.nextCursor;
    expect(cursor2).not.toBeNull();

    response = await yoga.fetch('http://localhost/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          query GetP3($cursor: String!) {
            bookmarks(take: 2, cursor: $cursor) {
              nodes { id title }
              nextCursor
              hasNextPage
            }
          }
        `,
        variables: { cursor: cursor2 },
      }),
    });
    result = (await response.json()) as BookmarksQueryResponse;
    expect(result.errors).toBeUndefined();
    expect(result.data?.bookmarks?.nodes).toHaveLength(1);
    expect(result.data?.bookmarks?.nodes?.[0]?.id).toBe('bookmark-5');
    expect(result.data?.bookmarks?.hasNextPage).toBe(false);
    expect(result.data?.bookmarks?.nextCursor).toBeNull();
  });
});
