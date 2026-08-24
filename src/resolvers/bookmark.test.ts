import { describe, it, expect, mock } from 'bun:test';
import { createYoga, createSchema } from 'graphql-yoga';
import { typeDefs } from '../schema/typeDefs.ts';
import { resolvers } from './index.ts';
import { ValidationError, NotFoundError } from '../validation/index.ts';

const mockFolders = [
  { id: 'folder-1', name: 'Folder 1', createdAt: new Date('2026-08-24T10:00:00Z') },
  { id: 'folder-2', name: 'Folder 2', createdAt: new Date('2026-08-24T11:00:00Z') },
];

const mockBookmarks = [
  { id: 'bookmark-1', title: 'Google', url: 'https://google.com', tags: ['search'], folderId: 'folder-1', createdAt: new Date('2026-08-24T10:05:00Z') },
];

mock.module('../services/folder.service.ts', () => {
  return {
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
});

mock.module('../services/bookmark.service.ts', () => {
  return {
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
  };
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
});
