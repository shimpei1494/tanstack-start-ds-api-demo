export function ErrorNotice({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="error-notice" role="alert">
      <span>{message}</span>
      {retry && <button onClick={retry}>再試行</button>}
    </div>
  );
}
