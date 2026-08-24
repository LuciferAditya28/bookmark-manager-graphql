import { describe, it, expect, mock } from 'bun:test';
import { createYoga, createSchema } from 'graphql-yoga';
import { typeDefs } from '../schema/typeDefs.ts';
import { resolvers } from './index.ts';
import { ValidationError } from '../validation/index.ts';

// Mock the service layer module using Bun's mock.module
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
      const trimmed = name.trim();
      if (!trimmed) {
        throw new ValidationError('Folder name cannot be empty or whitespace only');
      }
      return { id: 'folder-new', name: trimmed, createdAt: new Date('2026-08-24T12:00:00Z') };
    },
    getBookmarksForFolder: async (folderId: string) => {
      return mockBookmarks.filter(b => b.folderId === folderId);
    },
  };
});

const yoga = createYoga({
  schema: createSchema({
    typeDefs,
    resolvers,
  }),
});

describe('GraphQL Folder Resolvers', () => {
  it('createFolder successfully creates and returns a folder', async () => {
    const response = await yoga.fetch('http://localhost/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          mutation CreateFolder($name: String!) {
            createFolder(name: $name) {
              id
              name
              createdAt
            }
          }
        `,
        variables: { name: 'New Folder' },
      }),
    });

    expect(response.status).toBe(200);
    const result = (await response.json()) as {
      data?: { createFolder?: { id: string; name: string; createdAt: string } };
      errors?: Array<{ message: string }>;
    };
    expect(result.errors).toBeUndefined();
    expect(result.data?.createFolder).toBeDefined();
    expect(result.data?.createFolder?.id).toBe('folder-new');
    expect(result.data?.createFolder?.name).toBe('New Folder');
    expect(result.data?.createFolder?.createdAt).toBeDefined();
  });

  it('folders returns created folders list', async () => {
    const response = await yoga.fetch('http://localhost/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          query {
            folders {
              id
              name
            }
          }
        `,
      }),
    });

    expect(response.status).toBe(200);
    const result = (await response.json()) as {
      data?: { folders?: Array<{ id: string; name: string }> };
      errors?: Array<{ message: string }>;
    };
    expect(result.errors).toBeUndefined();
    expect(result.data?.folders).toHaveLength(2);
    expect(result.data?.folders?.[0]?.id).toBe('folder-1');
    expect(result.data?.folders?.[0]?.name).toBe('Folder 1');
  });

  it('folder(id) returns the correct folder', async () => {
    const response = await yoga.fetch('http://localhost/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          query GetFolder($id: ID!) {
            folder(id: $id) {
              id
              name
            }
          }
        `,
        variables: { id: 'folder-1' },
      }),
    });

    expect(response.status).toBe(200);
    const result = (await response.json()) as {
      data?: { folder?: { id: string; name: string } | null };
      errors?: Array<{ message: string }>;
    };
    expect(result.errors).toBeUndefined();
    expect(result.data?.folder).toBeDefined();
    expect(result.data?.folder?.id).toBe('folder-1');
    expect(result.data?.folder?.name).toBe('Folder 1');
  });

  it('folder(id) returns null for a non-existent ID', async () => {
    const response = await yoga.fetch('http://localhost/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          query GetFolder($id: ID!) {
            folder(id: $id) {
              id
              name
            }
          }
        `,
        variables: { id: 'non-existent' },
      }),
    });

    expect(response.status).toBe(200);
    const result = (await response.json()) as {
      data?: { folder?: { id: string; name: string } | null };
      errors?: Array<{ message: string }>;
    };
    expect(result.errors).toBeUndefined();
    expect(result.data?.folder).toBeNull();
  });

  it('whitespace-only folder names are rejected with a meaningful GraphQL error', async () => {
    const response = await yoga.fetch('http://localhost/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          mutation CreateFolder($name: String!) {
            createFolder(name: $name) {
              id
              name
            }
          }
        `,
        variables: { name: '   ' },
      }),
    });

    expect(response.status).toBe(200);
    const result = (await response.json()) as {
      data?: { createFolder?: null };
      errors?: Array<{ message: string; extensions?: { code?: string } }>;
    };
    expect(result.data).toBeNull();
    expect(result.errors).toBeDefined();
    expect(result.errors).toHaveLength(1);
    expect(result.errors?.[0]?.message).toBe('Folder name cannot be empty or whitespace only');
    expect(result.errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT');
  });

  it('Folder.bookmarks returns the bookmarks belonging to that folder', async () => {
    const response = await yoga.fetch('http://localhost/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          query GetFolderWithBookmarks($id: ID!) {
            folder(id: $id) {
              id
              bookmarks {
                id
                title
                url
                tags
              }
            }
          }
        `,
        variables: { id: 'folder-1' },
      }),
    });

    expect(response.status).toBe(200);
    const result = (await response.json()) as {
      data?: {
        folder?: {
          id: string;
          bookmarks?: Array<{ id: string; title: string; url: string; tags: string[] }>;
        } | null;
      };
      errors?: Array<{ message: string }>;
    };
    expect(result.errors).toBeUndefined();
    expect(result.data?.folder?.bookmarks).toHaveLength(1);
    expect(result.data?.folder?.bookmarks?.[0]?.id).toBe('bookmark-1');
    expect(result.data?.folder?.bookmarks?.[0]?.title).toBe('Google');
    expect(result.data?.folder?.bookmarks?.[0]?.url).toBe('https://google.com');
    expect(result.data?.folder?.bookmarks?.[0]?.tags).toEqual(['search']);
  });
});
