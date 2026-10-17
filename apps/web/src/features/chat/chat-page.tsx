import { useChat } from '@tanstack/ai-react';
import { useForm } from '@tanstack/react-form';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Lightbulb,
  LoaderCircle,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Square,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui/button';
import { chatFn } from '../../server/functions/chat';
import { ErrorNotice } from '../../components/ui/error-notice';
import { useChatProgress } from './use-chat-progress';

const prompts = [
  '今週やることを整理したい',
  'プレゼンの準備を一緒に考えて',
  '大きな目標を小さく分けたい',
];

export function ChatPage() {
  const [session, setSession] = useState(0);
  return <ChatSession key={session} onNewSession={() => setSession((value) => value + 1)} />;
}

function ChatSession({ onNewSession }: { onNewSession: () => void }) {
  const [stopped, setStopped] = useState(false);
  const progress = useChatProgress();
  const messageList = useRef<HTMLDivElement>(null);
  const chat = useChat({
    fetcher: ({ messages, threadId }, { signal }) =>
      chatFn({ data: { messages, threadId }, signal }),
    onChunk: progress.onChunk,
    onFinish: progress.reset,
    onError: progress.reset,
  });
  useEffect(() => {
    const list = messageList.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [chat.messages, progress.step]);
  const send = (content: string) => {
    if (!content.trim() || chat.isLoading) return;
    setStopped(false);
    progress.reset();
    void chat.sendMessage(content.trim()).catch(() => {});
  };
  const form = useForm({
    defaultValues: { message: '' },
    onSubmit: ({ value }) => {
      if (!value.message.trim() || chat.isLoading) return;
      send(value.message);
      form.reset();
    },
  });
  const regenerate = () => {
    setStopped(false);
    progress.reset();
    void chat.reload().catch(() => {});
  };
  return (
    <div className="page chat-page">
      <div className="eyebrow">A LITTLE SPACE TO THINK</div>
      <div className="page-heading">
        <div>
          <h1>
            一緒に、考えよう<span>。</span>
          </h1>
          <p>まだまとまらないアイデアも、そのまま話してみてください。</p>
        </div>
        <Button
          variant="secondary"
          disabled={chat.isLoading || chat.messages.length === 0}
          onClick={() => {
            chat.clear();
            onNewSession();
          }}
        >
          <RotateCcw size={15} />
          会話をリセット
        </Button>
      </div>
      <section className="chat-panel" aria-label="AIチャット">
        <header className="chat-panel-header">
          <span className="assistant-avatar">
            <Sparkles size={19} />
          </span>
          <div>
            <h2>余白アシスタント</h2>
            <span>
              <i />
              ダミーAI · 会話はこのページ内のみ
            </span>
          </div>
          <span className="chat-model">WORK COMPANION</span>
        </header>
        <div
          className="chat-messages"
          ref={messageList}
          role="log"
          aria-label="会話履歴"
          aria-live="polite"
          aria-relevant="additions text"
        >
          {chat.messages.length === 0 ? (
            <div className="chat-welcome">
              <div className="welcome-sparkles">
                <Sparkles size={34} strokeWidth={1.2} />
              </div>
              <span className="eyebrow">HELLO, LET'S MAKE SOME SPACE.</span>
              <h2>まずは、頭の中にあることから。</h2>
              <p>
                やることの整理、アイデアの壁打ち、次の一歩。
                <br />
                気軽な会話から、少しずつ形にしましょう。
              </p>
              <div className="prompt-list">
                {prompts.map((prompt, index) => (
                  <button key={prompt} onClick={() => send(prompt)}>
                    <span>
                      {index === 0 ? (
                        <Check size={16} />
                      ) : index === 1 ? (
                        <MessageSquare size={16} />
                      ) : (
                        <Lightbulb size={16} />
                      )}
                      {prompt}
                    </span>
                    <ArrowUp size={14} />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            chat.messages.map((message) => (
              <article
                className={`message message-${message.role}`}
                key={message.id}
                data-testid={`message-${message.role}`}
              >
                <span className="message-avatar">
                  {message.role === 'assistant' ? <Sparkles size={17} /> : 'Y'}
                </span>
                <div className="message-content">
                  <span className="message-author">
                    {message.role === 'assistant' ? '余白アシスタント' : 'あなた'}
                  </span>
                  <div className="message-text">
                    {message.parts.map((part, index) =>
                      part.type === 'text' ? <span key={index}>{part.content}</span> : null,
                    )}
                  </div>
                </div>
              </article>
            ))
          )}
          {chat.isLoading && (
            <output className="chat-progress">
              <LoaderCircle size={15} className="spin" />
              <span>{progress.step ?? '応答を待っています…'}</span>
              <div className="typing-dots">
                <i />
                <i />
                <i />
              </div>
            </output>
          )}
          {stopped && !chat.isLoading && (
            <div className="chat-status">
              <Square size={12} />
              生成を停止しました。表示中の回答は途中の内容です。
            </div>
          )}
          {chat.error && (
            <ErrorNotice
              message={chat.error.message || '回答を受け取れませんでした。もう一度お試しください。'}
              retry={regenerate}
            />
          )}
        </div>
        <div className="chat-compose-area">
          {chat.messages.some((message) => message.role === 'user') && !chat.isLoading && (
            <div className="chat-tools">
              <Button variant="ghost" onClick={regenerate}>
                <RefreshCw size={13} />
                もう一度生成
              </Button>
            </div>
          )}
          <form
            className="chat-compose"
            onSubmit={(event) => {
              event.preventDefault();
              void form.handleSubmit();
            }}
          >
            <form.Field
              name="message"
              validators={{
                onChange: ({ value }) =>
                  value.length > 4000 ? 'メッセージは4000文字以内で入力してください。' : undefined,
                onBlur: ({ value }) =>
                  value.length > 0 && !value.trim() ? 'メッセージを入力してください。' : undefined,
              }}
            >
              {(field) => (
                <>
                  <label htmlFor="chat-input" className="sr-only">
                    メッセージ
                  </label>
                  <textarea
                    id="chat-input"
                    name={field.name}
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={field.handleBlur}
                    aria-describedby="chat-input-help chat-input-error"
                    aria-invalid={field.state.meta.errors.length > 0}
                    placeholder="考えていることを、ここに。"
                    rows={2}
                    maxLength={4000}
                    onKeyDown={(event) => {
                      if (
                        event.key === 'Enter' &&
                        !event.shiftKey &&
                        !event.nativeEvent.isComposing
                      ) {
                        event.preventDefault();
                        void form.handleSubmit();
                      }
                    }}
                  />
                  <div id="chat-input-error" className="form-error" aria-live="polite">
                    {field.state.meta.errors.join(' ')}
                  </div>
                  <div className="compose-bottom">
                    <span id="chat-input-help">
                      Shift + Enter で改行{' '}
                      <span className="input-count">{field.state.value.length} / 4000</span>
                    </span>
                    {chat.isLoading ? (
                      <Button
                        key="stop"
                        type="button"
                        disabled={false}
                        variant="secondary"
                        onClick={() => {
                          chat.stop();
                          progress.reset();
                          setStopped(true);
                        }}
                      >
                        <Square size={14} fill="currentColor" />
                        生成を停止
                      </Button>
                    ) : (
                      <Button
                        key="send"
                        type="submit"
                        disabled={!field.state.value.trim() || field.state.meta.errors.length > 0}
                        aria-label="メッセージを送信"
                      >
                        <ArrowUp size={19} />
                      </Button>
                    )}
                  </div>
                </>
              )}
            </form.Field>
          </form>
          <p className="chat-disclaimer">
            <Sparkles size={11} />
            デモ用のダミー応答です。実際のAIモデルには接続していません。
          </p>
        </div>
      </section>
      <div className="chat-tip">
        <ArrowDown size={13} /> 会話は保存されません。ページを再読み込みするとリセットされます。
      </div>
    </div>
  );
}
