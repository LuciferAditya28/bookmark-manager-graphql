export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

export const validateTitle = (title: string): string => {
  const trimmed = title.trim();
  if (!trimmed) {
    throw new ValidationError('Bookmark title cannot be empty or whitespace only');
  }
  return trimmed;
};

export const validateUrl = (url: string): string => {
  const trimmed = url.trim();
  if (!trimmed) {
    throw new ValidationError('URL cannot be empty or whitespace only');
  }
  
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new ValidationError('Invalid URL format');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ValidationError('Bookmark URL must use http or https');
  }

  return trimmed;
};
