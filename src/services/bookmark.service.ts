import { prisma } from '../db/client.ts';
import { NotFoundError, validateTitle, validateUrl } from '../validation/index.ts';
import type { Bookmark } from '@prisma/client';

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

export const createBookmark = async (input: CreateBookmarkInput): Promise<Bookmark> => {
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
