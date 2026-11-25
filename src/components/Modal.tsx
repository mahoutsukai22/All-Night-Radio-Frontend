import { useEffect, useRef, type ReactNode } from 'react';
import Icon from './Icon';

type Props = {
  open: boolean;
  onClose: () => void;
  eyebrow: string;
  title: string;
  children: ReactNode;
};

/** Native <dialog>: focus trapping, Esc and the backdrop come from the browser. */
export default function Modal({ open, onClose, eyebrow, title, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current!;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      className="modal"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onClose={onClose}
      ref={ref}
    >
      {open && (
        <div className="modal-body">
          <header className="modal-head">
            <div>
              <p className="eyebrow">{eyebrow}</p>
              <h2>{title}</h2>
            </div>
            <button aria-label="Close" className="icon-btn" onClick={onClose} type="button">
              <Icon name="close" />
            </button>
          </header>
          {children}
        </div>
      )}
    </dialog>
  );
}
