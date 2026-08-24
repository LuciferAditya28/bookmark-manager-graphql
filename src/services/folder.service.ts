import { prisma } from '../db/client.ts';
import { ValidationError } from '../validation/index.ts';
import type { Folder, Bookmark } from '@prisma/client';

interface GlobalWithMocks {
  mockFolderService?: {
    getFolders?: () => Promise<Folder[]>;
    getFolderById?: (id: string) => Promise<Folder | null>;
    createFolder?: (name: string) => Promise<Folder>;
    getBookmarksForFolder?: (folderId: string) => Promise<Bookmark[]>;
  };
}

export const getFolders = async (): Promise<Folder[]> => {
  const delegate = (globalThis as unknown as GlobalWithMocks).mockFolderService;
  if (delegate?.getFolders) {
    return delegate.getFolders();
  }

  return prisma.folder.findMany({
    orderBy: [
      { createdAt: 'asc' },
      { id: 'asc' },
    ],
  });
};

export const getFolderById = async (id: string): Promise<Folder | null> => {
  const delegate = (globalThis as unknown as GlobalWithMocks).mockFolderService;
  if (delegate?.getFolderById) {
    return delegate.getFolderById(id);
  }

  return prisma.folder.findUnique({
    where: { id },
  });
};

export const createFolder = async (name: string): Promise<Folder> => {
  const delegate = (globalThis as unknown as GlobalWithMocks).mockFolderService;
  if (delegate?.createFolder) {
    return delegate.createFolder(name);
  }

  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new ValidationError('Folder name cannot be empty or whitespace only');
  }
  return prisma.folder.create({
    data: { name: trimmedName },
  });
};

export const getBookmarksForFolder = async (folderId: string): Promise<Bookmark[]> => {
  const delegate = (globalThis as unknown as GlobalWithMocks).mockFolderService;
  if (delegate?.getBookmarksForFolder) {
    return delegate.getBookmarksForFolder(folderId);
  }

  return prisma.bookmark.findMany({
    where: { folderId },
    orderBy: [
      { createdAt: 'asc' },
      { id: 'asc' },
    ],
  });
};
