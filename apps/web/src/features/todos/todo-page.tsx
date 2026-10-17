import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  ArrowRight,
  Check,
  CheckCheck,
  Circle,
  ClipboardList,
  LoaderCircle,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useState, useRef, useEffect, type CSSProperties } from 'react';
import type { TodoDto } from '../../contracts/todos';
import { Button } from '../../components/ui/button';
import { ErrorNotice } from '../../components/ui/error-notice';
import { todoKeys, todosQueryOptions, unwrap } from '../../queries/todos';
import { Route } from '../../routes/todos';
import {
  createTodoFn,
  deleteTodoFn,
  suggestTodosFn,
  updateTodoFn,
} from '../../server/functions/todos';

export function TodoPage() {
  const { filter } = Route.useSearch();
  const client = useQueryClient();
  const todos = useQuery(todosQueryOptions(filter));
  const allTodos = useQuery(todosQueryOptions('all'));
  const invalidate = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: todoKeys.all }),
      client.invalidateQueries({ queryKey: ['reports'] }),
    ]);
  const add = useMutation({
    mutationFn: async (title: string) => unwrap(await createTodoFn({ data: { title } })),
    onSuccess: invalidate,
  });
  const form = useForm({
    defaultValues: { title: '' },
    onSubmit: async ({ value }) => {
      await add.mutateAsync(value.title.trim());
      form.reset();
    },
  });
  const complete = (allTodos.data ?? []).filter((todo) => todo.completed).length;
  const total = allTodos.data?.length ?? 0;
  return (
    <div className="page todos-page">
      <div className="eyebrow">YOUR NEXT SMALL STEP</div>
      <div className="page-heading">
        <div>
          <h1>
            やることを、整えよう<span>。</span>
          </h1>
          <p>頭の中をほどいて、今日の一歩を見つけましょう。</p>
        </div>
        <div className="heading-decoration">
          <CheckCheck size={36} strokeWidth={1.3} />
        </div>
      </div>
      <div className="todo-layout">
        <section className="todo-main" aria-labelledby="todo-list-heading">
          <div className="summary-card">
            <div className="summary-icon">
              <ListIcon />
            </div>
            <div>
              <span>ひとつずつ、前に進んでいます</span>
              <strong>
                {complete}
                <small> / {total} 個完了</small>
              </strong>
            </div>
            <div
              className="progress-ring"
              style={{ '--progress': `${total ? (complete / total) * 100 : 0}%` } as CSSProperties}
            >
              <span>
                {total ? Math.round((complete / total) * 100) : 0}
                <small>%</small>
              </span>
            </div>
          </div>
          <form
            className="add-todo"
            onSubmit={(event) => {
              event.preventDefault();
              void form.handleSubmit().catch(() => {});
            }}
          >
            <form.Field
              name="title"
              validators={{
                onChange: ({ value }) =>
                  value.length > 200 ? '200文字以内で入力してください。' : undefined,
              }}
            >
              {(field) => (
                <>
                  <label className="sr-only" htmlFor="new-todo">
                    新しいTODO
                  </label>
                  <Plus size={21} />
                  <input
                    id="new-todo"
                    name={field.name}
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={field.handleBlur}
                    maxLength={200}
                    placeholder="新しくやることを追加…"
                    disabled={add.isPending}
                  />
                  <Button type="submit" disabled={add.isPending || !field.state.value.trim()}>
                    {add.isPending ? (
                      <LoaderCircle className="spin" size={17} />
                    ) : (
                      <Plus size={17} />
                    )}
                    追加
                  </Button>
                </>
              )}
            </form.Field>
          </form>
          {add.error && <ErrorNotice message={add.error.message} />}
          <div className="list-toolbar">
            <h2 id="todo-list-heading">
              マイTODO <span>{total}</span>
            </h2>
            <nav className="filters" aria-label="TODOの絞り込み">
              {(['all', 'active', 'completed'] as const).map((value) => (
                <Link
                  key={value}
                  to="/todos"
                  search={{ filter: value }}
                  activeOptions={{ exact: true, includeSearch: true }}
                  className={filter === value ? 'selected' : ''}
                >
                  {{ all: 'すべて', active: '未完了', completed: '完了' }[value]}
                </Link>
              ))}
            </nav>
          </div>
          <div className="todo-list" aria-busy={todos.isFetching}>
            {todos.isPending ? (
              <div className="empty-state">
                <LoaderCircle className="spin" />
                <p>読み込み中…</p>
              </div>
            ) : todos.isError ? (
              <ErrorNotice
                message="TODOを読み込めませんでした。"
                retry={() => void todos.refetch()}
              />
            ) : todos.data.length === 0 ? (
              <div className="empty-state">
                <ClipboardList size={35} strokeWidth={1.3} />
                <h3>
                  {filter === 'completed'
                    ? '完了したTODOはまだありません'
                    : filter === 'active'
                      ? 'すべて完了しました！'
                      : '最初の一歩を追加しましょう'}
                </h3>
                <p>
                  {filter === 'active'
                    ? 'ここまで、おつかれさまでした。'
                    : '小さなことからで大丈夫です。'}
                </p>
              </div>
            ) : (
              todos.data.map((todo) => <TodoRow key={todo.id} todo={todo} onSaved={invalidate} />)
            )}
          </div>
          <div className="list-footnote">
            <span className="tiny-dot" />
            変更は自動で保存されます
          </div>
        </section>
        <Suggestions
          onAdopt={async (title) => {
            await add.mutateAsync(title);
          }}
        />
      </div>
      <div className="bottom-callout">
        <span className="callout-icon">
          <MessageIcon />
        </span>
        <div>
          <h3>考えがまとまらないときは</h3>
          <p>AIとの会話で、次にやることを一緒に整理できます。</p>
        </div>
        <Link to="/chat">
          AIと考える
          <ArrowRight size={16} />
        </Link>
      </div>
    </div>
  );
}

function TodoRow({ todo, onSaved }: { todo: TodoDto; onSaved: () => Promise<unknown> }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(todo.title);
  const [pendingCompleted, setPendingCompleted] = useState<boolean | null>(null);
  const editInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) editInput.current?.focus();
  }, [editing]);
  const change = useMutation({
    mutationFn: async (input: { title?: string; completed?: boolean }) =>
      unwrap(await updateTodoFn({ data: { id: todo.id, ...input } })),
    onSuccess: async () => {
      setEditing(false);
      await onSaved();
    },
    onSettled: () => setPendingCompleted(null),
  });
  const remove = useMutation({
    mutationFn: async () => unwrap(await deleteTodoFn({ data: { id: todo.id } })),
    onSuccess: onSaved,
  });
  const busy = change.isPending || remove.isPending;
  const completed = pendingCompleted ?? todo.completed;
  return (
    <div
      className={`todo-row ${completed ? 'completed' : ''} ${busy ? 'is-pending' : ''}`}
      data-testid="todo-row"
    >
      {editing ? (
        <form
          className="edit-todo"
          onSubmit={(event) => {
            event.preventDefault();
            if (title.trim()) void change.mutateAsync({ title: title.trim() }).catch(() => {});
          }}
        >
          <input
            aria-label="TODOのタイトルを編集"
            ref={editInput}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={200}
            disabled={busy}
          />
          <Button type="submit" disabled={busy || !title.trim()} variant="secondary">
            保存
          </Button>
          <Button
            type="button"
            variant="ghost"
            aria-label="編集をキャンセル"
            onClick={() => {
              setEditing(false);
              setTitle(todo.title);
            }}
          >
            <X size={16} />
          </Button>
        </form>
      ) : (
        <>
          <input
            type="checkbox"
            className="todo-checkbox"
            checked={completed}
            aria-label={`${todo.title}を${todo.completed ? '未完了' : '完了'}にする`}
            disabled={busy}
            onChange={(event) => {
              const next = event.target.checked;
              setPendingCompleted(next);
              change.mutate({ completed: next });
            }}
          />
          <span className="todo-title">{todo.title}</span>
          <div className="todo-actions">
            <button
              aria-label={`${todo.title}を編集`}
              disabled={busy}
              onClick={() => setEditing(true)}
            >
              <Pencil size={15} />
            </button>
            <button
              aria-label={`${todo.title}を削除`}
              disabled={busy}
              onClick={() => remove.mutate()}
            >
              <Trash2 size={15} />
            </button>
          </div>
        </>
      )}
      {(change.error || remove.error) && (
        <ErrorNotice message={(change.error || remove.error)!.message} />
      )}
    </div>
  );
}

function Suggestions({ onAdopt }: { onAdopt: (title: string) => Promise<void> }) {
  const [goal, setGoal] = useState('');
  const [adopted, setAdopted] = useState<number[]>([]);
  const [adopting, setAdopting] = useState<number | null>(null);
  const [adoptionError, setAdoptionError] = useState<string | null>(null);
  const suggestions = useMutation({
    mutationFn: async () => unwrap(await suggestTodosFn({ data: { goal: goal.trim() } })),
    onSuccess: () => {
      setAdopted([]);
      setAdoptionError(null);
    },
  });
  async function adopt(index: number, title: string) {
    setAdopting(index);
    setAdoptionError(null);
    try {
      await onAdopt(title);
      setAdopted((previous) => [...previous, index]);
    } catch (error) {
      setAdoptionError(error instanceof Error ? error.message : '追加できませんでした。');
    } finally {
      setAdopting(null);
    }
  }
  return (
    <aside className="suggestion-card" aria-labelledby="suggestion-heading">
      <div className="suggestion-topline">
        <span>
          <Sparkles size={17} />
          AI ASSISTANT
        </span>
        <span className="small-badge">DEMO</span>
      </div>
      <div className="suggestion-symbol">
        <Sparkles size={25} strokeWidth={1.5} />
      </div>
      <h2 id="suggestion-heading">目標を、小さな一歩に。</h2>
      <p>
        やりたいことを教えてください。
        <br />
        取り組みやすいTODOを提案します。
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (goal.trim()) suggestions.mutate();
        }}
      >
        <label htmlFor="goal">何を進めたいですか？</label>
        <textarea
          id="goal"
          value={goal}
          onChange={(event) => setGoal(event.target.value)}
          placeholder="例：来週のプレゼンの準備をしたい"
          rows={4}
          maxLength={500}
          disabled={suggestions.isPending || adopting !== null}
        />
        <Button type="submit" disabled={!goal.trim() || suggestions.isPending || adopting !== null}>
          {suggestions.isPending ? (
            <LoaderCircle size={17} className="spin" />
          ) : (
            <Sparkles size={16} />
          )}
          {suggestions.isPending ? '一歩を考えています…' : 'TODOを提案してもらう'}
          {!suggestions.isPending && <ArrowRight size={16} />}
        </Button>
      </form>
      {suggestions.error && <ErrorNotice message={suggestions.error.message} />}
      {suggestions.data && (
        <div className="suggestions" aria-live="polite">
          <div className="suggestions-title">
            こんな一歩はどうでしょう<span>{suggestions.data.suggestions.length} 件</span>
          </div>
          {suggestions.data.suggestions.map((suggestion, index) => (
            <div className="suggestion-item" key={`${suggestions.submittedAt}-${index}`}>
              <span className="suggestion-number">{String(index + 1).padStart(2, '0')}</span>
              <span>{suggestion.title}</span>
              <button
                aria-label={`${suggestion.title}をTODOに追加`}
                disabled={adopted.includes(index) || adopting !== null || suggestions.isPending}
                onClick={() => void adopt(index, suggestion.title)}
              >
                {adopting === index ? (
                  <LoaderCircle size={17} className="spin" />
                ) : adopted.includes(index) ? (
                  <Check size={17} />
                ) : (
                  <Plus size={17} />
                )}
              </button>
            </div>
          ))}
          <small>必要な候補の「＋」を押すと保存されます。</small>
        </div>
      )}
      {adoptionError && <ErrorNotice message={adoptionError} />}
      <div className="suggestion-disclaimer">
        <Circle size={11} />
        <span>
          ダミーAIの提案です。内容を確認して、
          <br />
          必要なものだけ追加してください。
        </span>
      </div>
    </aside>
  );
}

function ListIcon() {
  return <ClipboardList size={21} strokeWidth={1.6} />;
}
function MessageIcon() {
  return <Sparkles size={22} strokeWidth={1.6} />;
}
