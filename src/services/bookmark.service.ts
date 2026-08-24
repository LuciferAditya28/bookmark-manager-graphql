import { prisma } from '../db/client.ts';
import {
  NotFoundError,
  ValidationError,
  validateTitle,
  validateUrl,
  decodeCursor,
  encodeCursor,
} from '../validation/index.ts';
import type { Bookmark, Prisma } from '@prisma/client';

interface GlobalWithMocks {
  mockBookmarkService?: {
    createBookmark?: (input: CreateBookmarkInput) => Promise<Bookmark>;
    updateBookmark?: (id: string, input: UpdateBookmarkInput) => Promise<Bookmark>;
    deleteBookmark?: (id: string) => Promise<Bookmark>;
    moveBookmark?: (id: string, folderId: string) => Promise<Bookmark>;
    getBookmarksPaginated?: (args: GetBookmarksArgs) => Promise<BookmarkConnection>;
  };
}

export interface CreateBookmarkInput {
  title: string;
  url: string;
  folderId: string;
  tags?: string[] | null;
}

export interface UpdateBookmarkInput {
  title?: string | null;
  url?: string | null;
  tags?: string[] | null;
}

export interface GetBookmarksArgs {
  folderId?: string | null;
  search?: string | null;
  take?: number | null;
  cursor?: string | null;
}

export interface BookmarkConnection {
  nodes: Bookmark[];
  nextCursor: string | null;
  hasNextPage: boolean;
}

export const createBookmark = async (input: CreateBookmarkInput): Promise<Bookmark> => {
  const delegate = (globalThis as unknown as GlobalWithMocks).mockBookmarkService;
  if (delegate?.createBookmark) {
    return delegate.createBookmark(input);
  }

  const title = validateTitle(input.title);
  const url = validateUrl(input.url);

  // Check if destination folder exists
  const folder = await prisma.folder.findUnique({
    where: { id: input.folderId },
  });
  if (!folder) {
    throw new NotFoundError(`Destination folder with ID "${input.folderId}" not found`);
  }

  return prisma.bookmark.create({
    data: {
      title,
      url,
      folderId: input.folderId,
      tags: input.tags ?? [],
    },
  });
};

export const updateBookmark = async (id: string, input: UpdateBookmarkInput): Promise<Bookmark> => {
  const delegate = (globalThis as unknown as GlobalWithMocks).mockBookmarkService;
  if (delegate?.updateBookmark) {
    return delegate.updateBookmark(id, input);
  }

  const bookmark = await prisma.bookmark.findUnique({
    where: { id },
  });
  if (!bookmark) {
    throw new NotFoundError(`Bookmark with ID "${id}" not found`);
  }

  const data: Partial<Omit<Bookmark, 'id' | 'createdAt' | 'folderId'>> = {};

  if (input.title !== undefined && input.title !== null) {
    data.title = validateTitle(input.title);
  }
  if (input.url !== undefined && input.url !== null) {
    data.url = validateUrl(input.url);
  }
  if (input.tags !== undefined && input.tags !== null) {
    data.tags = input.tags;
  }

  return prisma.bookmark.update({
    where: { id },
    data,
  });
};

export const deleteBookmark = async (id: string): Promise<Bookmark> => {
  const delegate = (globalThis as unknown as GlobalWithMocks).mockBookmarkService;
  if (delegate?.deleteBookmark) {
    return delegate.deleteBookmark(id);
  }

  const bookmark = await prisma.bookmark.findUnique({
    where: { id },
  });
  if (!bookmark) {
    throw new NotFoundError(`Bookmark with ID "${id}" not found`);
  }

  return prisma.bookmark.delete({
    where: { id },
  });
};

export const moveBookmark = async (id: string, folderId: string): Promise<Bookmark> => {
  const delegate = (globalThis as unknown as GlobalWithMocks).mockBookmarkService;
  if (delegate?.moveBookmark) {
    return delegate.moveBookmark(id, folderId);
  }

  const bookmark = await prisma.bookmark.findUnique({
    where: { id },
  });
  if (!bookmark) {
    throw new NotFoundError(`Bookmark with ID "${id}" not found`);
  }

  const folder = await prisma.folder.findUnique({
    where: { id: folderId },
  });
  if (!folder) {
    throw new NotFoundError(`Destination folder with ID "${folderId}" not found`);
  }

  return prisma.bookmark.update({
    where: { id },
    data: { folderId },
  });
};

export const getBookmarksPaginated = async (args: GetBookmarksArgs): Promise<BookmarkConnection> => {
  const delegate = (globalThis as unknown as GlobalWithMocks).mockBookmarkService;
  if (delegate?.getBookmarksPaginated) {
    return delegate.getBookmarksPaginated(args);
  }

  const take = args.take ?? 20;

  if (take <= 0 || take > 100) {
    throw new ValidationError('take parameter must be greater than 0 and less than or equal to 100');
  }

  const where: Prisma.BookmarkWhereInput = {};

  if (args.folderId) {
    where.folderId = args.folderId;
  }

  if (args.search?.trim()) {
    where.title = {
      contains: args.search.trim(),
      mode: 'insensitive',
    };
  }

  if (args.cursor) {
    const decoded = decodeCursor(args.cursor);
    where.AND = [
      {
        OR: [
          {
            createdAt: {
              lt: decoded.createdAt,
            },
          },
          {
            AND: [
              {
                createdAt: {
                  equals: decoded.createdAt,
                },
              },
              {
                id: {
                  lt: decoded.id,
                },
              },
            ],
          },
        ],
      },
    ];
  }

  // Fetch take + 1 records
  const results = await prisma.bookmark.findMany({
    where,
    take: take + 1,
    orderBy: [
      { createdAt: 'desc' },
      { id: 'desc' },
    ],
  });

  const hasNextPage = results.length > take;
  const nodes = hasNextPage ? results.slice(0, take) : results;

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
};
