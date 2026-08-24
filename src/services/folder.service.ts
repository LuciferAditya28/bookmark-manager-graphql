import { prisma } from '../db/client.ts';
import { ValidationError } from '../validation/index.ts';
import type { Folder, Bookmark } from '@prisma/client';

export const getFolders = async (): Promise<Folder[]> => {
  return prisma.folder.findMany({
    orderBy: [
      { createdAt: 'asc' },
      { id: 'asc' },
    ],
  });
};

export const getFolderById = async (id: string): Promise<Folder | null> => {
  return prisma.folder.findUnique({
    where: { id },
  });
};

export const createFolder = async (name: string): Promise<Folder> => {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new ValidationError('Folder name cannot be empty or whitespace only');
  }
  return prisma.folder.create({
    data: { name: trimmedName },
  });
};

export const getBookmarksForFolder = async (folderId: string): Promise<Bookmark[]> => {
  return prisma.bookmark.findMany({
    where: { folderId },
    orderBy: [
      { createdAt: 'asc' },
      { id: 'asc' },
    ],
  });
};
