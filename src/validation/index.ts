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

export const encodeCursor = (createdAt: Date, id: string): string => {
  const payload = JSON.stringify({ createdAt: createdAt.toISOString(), id });
  return Buffer.from(payload, 'utf-8').toString('base64');
};

export interface DecodedCursor {
  createdAt: Date;
  id: string;
}

export const decodeCursor = (cursor: string): DecodedCursor => {
  let decodedString: string;
  try {
    decodedString = Buffer.from(cursor, 'base64').toString('utf-8');
  } catch {
    throw new ValidationError('Invalid cursor: malformed base64 encoding');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decodedString);
  } catch {
    throw new ValidationError('Invalid cursor: malformed JSON payload');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new ValidationError('Invalid cursor: payload must be a JSON object');
  }

  const obj = parsed as Record<string, unknown>;

  if (typeof obj.id !== 'string' || !obj.id.trim()) {
    throw new ValidationError('Invalid cursor: missing or empty bookmark ID');
  }

  if (typeof obj.createdAt !== 'string') {
    throw new ValidationError('Invalid cursor: missing or invalid creation date type');
  }

  const date = new Date(obj.createdAt);
  if (isNaN(date.getTime())) {
    throw new ValidationError('Invalid cursor: creation date is not a valid date');
  }

  return {
    createdAt: date,
    id: obj.id,
  };
};
