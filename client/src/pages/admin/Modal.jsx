import styles from './Modal.module.css';
import { ICONS } from '../../icons';

/**
 * Shared screen-settings-style popup: fixed-height frame with a sticky
 * title/header, an independently-scrolling body, and sticky actions —
 * so long forms never get cut off regardless of viewport height.
 *
 * Pass `onSubmit` to render the body as a <form> (for Enter-to-submit /
 * submit-button forms); omit it for plain click-driven modals.
 */
export default function Modal({ onClose, title, width = 480, closeButton = false, onSubmit, footer, children }) {
  const header = closeButton ? (
    <div className={styles.modalHeader}>
      <span>{title}</span>
      <button type="button" className={styles.closeBtn} onClick={onClose}>{ICONS.close}</button>
    </div>
  ) : (
    <div className={styles.modalTitle}>{title}</div>
  );

  const body = <div className={styles.modalBody}>{children}</div>;
  const actions = footer && <div className={styles.modalActions}>{footer}</div>;

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.modal} style={{ width, maxWidth: '90vw' }} onClick={(e) => e.stopPropagation()}>
        {header}
        {onSubmit ? (
          <form onSubmit={onSubmit} className={styles.formWrap}>
            {body}
            {actions}
          </form>
        ) : (
          <>
            {body}
            {actions}
          </>
        )}
      </div>
    </div>
  );
}
