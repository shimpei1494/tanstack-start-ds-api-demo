import type { ReportScenario } from '@demo/ds-contract';
import { QueryErrorResetBoundary, useSuspenseQuery } from '@tanstack/react-query';
import { CatchBoundary, Link, useHydrated } from '@tanstack/react-router';
import {
  ArrowRight,
  ChartNoAxesCombined,
  CheckCheck,
  Circle,
  Clock3,
  Leaf,
  ListTodo,
  LoaderCircle,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { Suspense } from 'react';
import { Button } from '../../components/ui/button';
import { ErrorNotice } from '../../components/ui/error-notice';
import { reportQueryOptions } from '../../queries/reports';
import { Route } from '../../routes/reports';

const scenarios = [
  { value: 'slow', label: 'ゆっくり振り返る', detail: '3秒ほど待って、結果を表示', Icon: Clock3 },
  {
    value: 'error',
    label: 'エラー表示を試す',
    detail: '3秒ほど待って、エラーを表示',
    Icon: Circle,
  },
  {
    value: 'normal',
    label: 'すぐに振り返る',
    detail: '待ち時間を入れずに表示',
    Icon: ChartNoAxesCombined,
  },
] as const;

export function ReportPage() {
  const { scenario } = Route.useSearch();
  return (
    <div className="page reports-page">
      <div className="eyebrow">TAKE A MOMENT TO REFLECT</div>
      <div className="page-heading">
        <div>
          <h1>
            ここまでを、振り返ろう<span>。</span>
          </h1>
          <p>積み重ねた一歩を眺めて、次に進むヒントを見つけましょう。</p>
        </div>
        <div className="heading-decoration">
          <ChartNoAxesCombined size={33} strokeWidth={1.3} />
        </div>
      </div>
      <div className="report-layout">
        <div className="report-result-container">
          <QueryErrorResetBoundary key={scenario}>
            {({ reset }) => (
              <CatchBoundary
                getResetKey={() => scenario}
                errorComponent={({ error, reset: resetBoundary }) => (
                  <section
                    className="report-panel report-initial-error"
                    aria-label="レポートのエラー"
                  >
                    <span className="report-error-symbol">
                      <Leaf size={28} strokeWidth={1.4} />
                    </span>
                    <span className="eyebrow">LET'S TRY AGAIN</span>
                    <h2>レポートを作成できませんでした</h2>
                    <p>
                      少し時間をおいて、もう一度お試しください。
                      <br />
                      保存したTODOはそのまま残っています。
                    </p>
                    <ErrorNotice
                      message={
                        error instanceof Error
                          ? error.message
                          : '作業の進み具合を取得できませんでした。'
                      }
                    />
                    <Button
                      onClick={() => {
                        reset();
                        resetBoundary();
                      }}
                    >
                      <RefreshCw size={15} />
                      もう一度試す
                    </Button>
                  </section>
                )}
              >
                <Suspense fallback={<ReportPending />}>
                  <ReportResult scenario={scenario} />
                </Suspense>
              </CatchBoundary>
            )}
          </QueryErrorResetBoundary>
        </div>
        <aside className="report-demo-card" aria-labelledby="report-demo-heading">
          <div className="suggestion-topline">
            <span>
              <Sparkles size={17} />
              TRY THE DEMO
            </span>
            <span className="small-badge">DEMO</span>
          </div>
          <h2 id="report-demo-heading">待っている間も、自然に。</h2>
          <p>
            結果が届くまでの表示や、
            <br />
            うまくいかなかったときの動きを試せます。
          </p>
          <nav aria-label="レポートの応答">
            {scenarios.map(({ value, label, detail, Icon }) => (
              <Link
                key={value}
                to="/reports"
                search={{ scenario: value }}
                preload={false}
                className={`report-scenario ${scenario === value ? 'selected' : ''}`}
                aria-label={label}
                aria-current={scenario === value ? 'page' : undefined}
              >
                <Icon size={16} strokeWidth={1.6} />
                <span>
                  <strong>{label}</strong>
                  <small>{detail}</small>
                </span>
                <span className="report-scenario-dot" />
              </Link>
            ))}
          </nav>
          <div className="report-demo-note">
            <RefreshCw size={14} />
            <p>「再集計」では、前回の結果を表示しながら新しい結果を待ちます。</p>
          </div>
          <p className="report-demo-disclaimer">
            デモ用の待ち時間です。振り返りを開いても、TODOは変更されません。
          </p>
        </aside>
      </div>
      <div className="report-bottom-note">
        <Leaf size={15} strokeWidth={1.5} />
        <span>進んだ分だけ、ちゃんと前へ。小さな一歩も振り返ってみましょう。</span>
      </div>
    </div>
  );
}

function ReportPending() {
  return (
    <section
      className="report-panel report-pending"
      aria-label="レポートを集計中"
      data-testid="report-pending"
      aria-busy="true"
    >
      <div className="report-panel-heading">
        <h2>
          <ChartNoAxesCombined size={18} />
          作業レポート
        </h2>
        <span className="report-pending-label">準備中</span>
      </div>
      <output className="report-loading-message">
        <LoaderCircle size={17} className="spin" />
        <span>作業の進み具合をまとめています…</span>
      </output>
      <div className="report-stats report-skeleton" aria-hidden="true">
        {[0, 1, 2].map((item) => (
          <div key={item}>
            <span />
            <strong />
            <small />
          </div>
        ))}
      </div>
      <div className="report-skeleton-copy" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="report-skeleton-list" aria-hidden="true">
        {[0, 1].map((item) => (
          <div key={item}>
            <i />
            <span />
          </div>
        ))}
      </div>
      <p className="report-loading-note">
        このまま少しお待ちください。ほかのページにも移動できます。
      </p>
    </section>
  );
}

function ReportResult({ scenario }: { scenario: ReportScenario }) {
  const hydrated = useHydrated();
  // With cached data, useSuspenseQuery keeps that data visible during refetch
  // and exposes its error inline instead of throwing away the previous report.
  const { data, isFetching, error, refetch } = useSuspenseQuery(reportQueryOptions(scenario));
  const completion = data.total ? Math.round((data.completed / data.total) * 100) : 0;
  const generatedAt = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(data.generatedAt));
  return (
    <section
      className="report-panel"
      aria-label="作業レポート"
      data-testid="work-report-result"
      aria-busy={isFetching}
    >
      <div className="report-panel-heading">
        <h2>
          <ChartNoAxesCombined size={18} />
          作業レポート
        </h2>
        <Button
          variant="secondary"
          disabled={!hydrated || isFetching}
          onClick={() => void refetch()}
        >
          {isFetching ? <LoaderCircle size={14} className="spin" /> : <RefreshCw size={14} />}再集計
        </Button>
      </div>
      <output className={`report-result-status ${error ? 'has-error' : ''}`}>
        {isFetching ? (
          <>
            <LoaderCircle size={12} className="spin" />
            前回の結果を表示しながら再集計しています…
          </>
        ) : error ? (
          <>再集計に失敗しました。前回の結果を表示しています。</>
        ) : (
          <>
            <span className="tiny-dot" />
            最新の集計結果です。
          </>
        )}
      </output>
      {error && <ErrorNotice message={error.message || 'もう一度お試しください。'} />}
      <div className="report-stats">
        {[
          { label: 'すべてのTODO', value: data.total, Icon: ListTodo },
          { label: '完了したこと', value: data.completed, Icon: CheckCheck },
          { label: 'これからのこと', value: data.remaining, Icon: Clock3 },
        ].map(({ label, value, Icon }) => (
          <div key={label}>
            <span>
              <Icon size={15} strokeWidth={1.7} />
              {label}
            </span>
            <strong
              data-testid={
                label === 'すべてのTODO'
                  ? 'report-count-total'
                  : label === '完了したこと'
                    ? 'report-count-completed'
                    : 'report-count-remaining'
              }
            >
              {value}
              <small>件</small>
            </strong>
          </div>
        ))}
      </div>
      <div className="report-completion">
        <div>
          <span>ここまでの達成率</span>
          <strong>
            {completion}
            <small>%</small>
          </strong>
        </div>
        <progress
          className="report-progress-track"
          aria-label="TODOの達成率"
          value={completion}
          max={100}
        />
      </div>
      <div className="report-summary">
        <span className="report-summary-icon">
          <Sparkles size={20} strokeWidth={1.5} />
        </span>
        <div>
          <h3>ここまでの、あなたの一歩。</h3>
          <p>{data.summary}</p>
        </div>
      </div>
      <div className="report-next-todos">
        <div className="report-section-heading">
          <h3>次に取り組むこと</h3>
          <Link to="/todos" search={{ filter: 'active' }}>
            TODOを整理する
            <ArrowRight size={13} />
          </Link>
        </div>
        {data.nextTodos.length ? (
          <ol>
            {data.nextTodos.map((todo, index) => (
              <li key={todo.id}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <p>{todo.title}</p>
              </li>
            ))}
          </ol>
        ) : (
          <div className="report-all-done">
            <CheckCheck size={23} strokeWidth={1.5} />
            <p>
              未完了のTODOはありません。
              <br />
              <small>ひと区切り、おつかれさまでした。</small>
            </p>
          </div>
        )}
      </div>
      <div className="report-next-steps">
        <h3>
          <Leaf size={15} />
          次の一歩のヒント
        </h3>
        {data.nextSteps.length ? (
          <ul>
            {data.nextSteps.map((step, index) => (
              <li key={index}>
                <span className="tiny-dot" />
                <span>{step}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p>少し余白をつくって、次にやりたいことを考えてみましょう。</p>
        )}
        <span>ダミーAIによる提案です。自分のペースに合わせて選んでください。</span>
      </div>
      <div className="report-generated-at">
        <time data-testid="report-generated-at" dateTime={data.generatedAt}>
          {generatedAt} 集計
        </time>
        <span>TODOの変更は、次の集計に反映されます。</span>
      </div>
    </section>
  );
}
