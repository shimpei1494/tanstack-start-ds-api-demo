import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTodoService } from './todos';
import type { Todo, TodoRepository } from './todo-repository';
import { ApplicationError, publicResult, toPublicError } from './errors';

const id = '104d5cf8-66e8-49f0-8902-897b4ab4c946';
const todo: Todo = {
  id,
  title: 'Write a test',
  completed: false,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};
let repository: TodoRepository;

beforeEach(() => {
  repository = {
    list: vi.fn().mockResolvedValue([todo]),
    create: vi.fn().mockImplementation(async (title) => ({ ...todo, title })),
    update: vi.fn().mockResolvedValue(todo),
    delete: vi.fn().mockResolvedValue(true),
  };
});

describe('TODO use cases', () => {
  it('normalizes titles before storage and returns the public DTO', async () => {
    const created = await createTodoService(repository).create({ title: '  Plan the day  ' });
    expect(repository.create).toHaveBeenCalledWith('Plan the day');
    expect(created).toEqual({
      ...todo,
      title: 'Plan the day',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('rejects empty titles before touching the repository', async () => {
    await expect(createTodoService(repository).create({ title: '  ' })).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('keeps filtering in the repository and converts database dates', async () => {
    const result = await createTodoService(repository).list('active');
    expect(repository.list).toHaveBeenCalledWith('active');
    expect(result[0]?.createdAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('updates only requested fields, preserving false completion values', async () => {
    await createTodoService(repository).update({ id, completed: false });
    expect(repository.update).toHaveBeenCalledWith(id, { completed: false });
  });

  it('rejects a request without changes', async () => {
    await expect(createTodoService(repository).update({ id })).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('reports not-found consistently for updates and deletions', async () => {
    vi.mocked(repository.update).mockResolvedValue(undefined);
    vi.mocked(repository.delete).mockResolvedValue(false);
    const service = createTodoService(repository);
    await expect(service.update({ id, title: 'New title' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(service.delete(id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('public errors', () => {
  it('does not reveal database credentials or exception details', async () => {
    const result = await publicResult(async () => {
      throw new Error('postgresql://secret:password@db/private');
    });
    expect(result).toEqual({
      ok: false,
      error: {
        code: 'INTERNAL',
        message: '処理に失敗しました。しばらくしてから再試行してください。',
      },
    });
    expect(JSON.stringify(result)).not.toContain('password');
  });

  it('exposes stable safe messages for business and DS failures', () => {
    expect(toPublicError(new ApplicationError('NOT_FOUND', 'private detail')).code).toBe(
      'NOT_FOUND',
    );
    const dsError = Object.assign(new Error('upstream private body'), {
      name: 'DsError',
      code: 'TIMEOUT',
    });
    expect(toPublicError(dsError)).toEqual({
      code: 'TIMEOUT',
      message: 'AIサービスの応答がタイムアウトしました。再試行してください。',
    });
  });
});
