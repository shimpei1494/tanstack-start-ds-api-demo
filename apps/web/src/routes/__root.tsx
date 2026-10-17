import type { QueryClient } from '@tanstack/react-query';
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router';
import {
  ArrowUpRight,
  CheckCheck,
  ChartNoAxesCombined,
  CircleHelp,
  Layers3,
  ListTodo,
  MessageSquare,
  Sparkles,
} from 'lucide-react';
import { appInfoFn } from '../server/functions/status';
import '../styles.css';

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  loader: () => appInfoFn(),
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: '余白 — Work companion' },
      { name: 'description', content: 'やることを整えて、次の一歩を見つけるワークスペース。' },
    ],
  }),
  component: RootLayout,
  notFoundComponent: () => (
    <div className="route-message">
      <h1>ページが見つかりません</h1>
      <Link to="/todos" search={{ filter: 'all' }}>
        TODOへ戻る
      </Link>
    </div>
  ),
  errorComponent: ({ reset }) => (
    <div className="route-message">
      <h1>ページを読み込めませんでした</h1>
      <p>接続を確認して、もう一度お試しください。</p>
      <button onClick={reset}>再試行</button>
    </div>
  ),
});

function RootLayout() {
  const info = Route.useLoaderData();
  return (
    <html lang="ja">
      <head>
        <HeadContent />
      </head>
      <body>
        <a className="skip-link" href="#main-content">
          本文へ移動
        </a>
        <div className="app-shell">
          <aside className="sidebar">
            <Link to="/todos" search={{ filter: 'all' }} className="brand" aria-label="余白 ホーム">
              <span className="brand-icon">
                <Layers3 size={23} strokeWidth={1.7} />
              </span>
              <span>
                余白<span className="brand-en">YOHAKU</span>
              </span>
            </Link>
            <div className="workspace-label">PERSONAL WORKSPACE</div>
            <nav aria-label="メインナビゲーション">
              <Link
                to="/todos"
                search={{ filter: 'all' }}
                className="nav-item"
                activeOptions={{ includeSearch: false }}
                activeProps={{ className: 'nav-item active' }}
              >
                <ListTodo size={19} />
                やること
                <span className="nav-dot" />
              </Link>
              <Link
                to="/chat"
                className="nav-item"
                activeOptions={{ includeSearch: false }}
                activeProps={{ className: 'nav-item active' }}
              >
                <MessageSquare size={19} />
                AIと考える
              </Link>
              <Link
                to="/reports"
                search={{ scenario: 'slow' }}
                preload={false}
                className="nav-item"
                activeOptions={{ includeSearch: false }}
                activeProps={{ className: 'nav-item active' }}
              >
                <ChartNoAxesCombined size={19} />
                振り返る
              </Link>
            </nav>
            <div className="sidebar-note">
              <Sparkles size={21} />
              <p>
                大きな目標も、
                <br />
                小さな一歩から。
              </p>
              <span>
                考えることも、進めることも。
                <br />
                あなたのペースで。
              </span>
            </div>
            <div className="sidebar-bottom">
              <div className="connection">
                <span />
                {info.dsMode === 'mock' ? 'ローカルモック' : 'DS API 接続'}
                <ArrowUpRight size={13} />
              </div>
              <div className="profile">
                <span className="avatar">Y</span>
                <div>
                  マイワークスペース<small>Personal · Demo</small>
                </div>
                <CircleHelp size={17} />
              </div>
            </div>
          </aside>
          <div className="main-shell">
            <header className="topbar">
              <div>
                <CheckCheck size={16} />
                <span>自分らしく、ひとつずつ。</span>
              </div>
              <span className="demo-badge">
                <span />
                ダミーAIで動作中
              </span>
            </header>
            <main id="main-content">
              <Outlet />
            </main>
            <footer className="site-footer">
              <span>余白をつくって、前へ。</span>
              <span>TanStack Start × DS API</span>
            </footer>
          </div>
        </div>
        <Scripts />
      </body>
    </html>
  );
}
