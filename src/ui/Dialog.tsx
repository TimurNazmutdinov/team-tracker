import { useEffect, useId, useRef, type ReactNode } from 'react';

/**
 * Модальное окно на элементе <dialog>: фокус остаётся внутри, Esc закрывает.
 * Монтируется только пока окно открыто.
 */
export function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="dialog-head">
        <h2 id={titleId}>{title}</h2>
        <span className="muted">Esc</span>
      </div>
      {children}
    </dialog>
  );
}
