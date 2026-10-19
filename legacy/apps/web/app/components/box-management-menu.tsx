'use client';

import { useEffect, useRef, type ReactNode } from 'react';

export function BoxManagementMenu({
  children,
  openOnMount = false,
}: {
  children: ReactNode;
  openOnMount?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (openOnMount && !dialog.current?.open) dialog.current?.showModal();
  }, [openOnMount]);

  return (
    <>
      <button
        className="box-management-trigger"
        type="button"
        aria-haspopup="dialog"
        onClick={() => dialog.current?.showModal()}
      >
        Manage Box
      </button>
      <dialog
        aria-labelledby="box-management-title"
        className="box-management-dialog"
        ref={dialog}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <header className="box-management-header">
          <div>
            <p className="eyebrow">Private space controls</p>
            <h2 id="box-management-title">Manage Box</h2>
          </div>
          <button
            className="box-management-close"
            type="button"
            aria-label="Close Box management"
            onClick={() => dialog.current?.close()}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M5 5l14 14M19 5 5 19" />
            </svg>
          </button>
        </header>
        <div className="box-management-content">{children}</div>
      </dialog>
    </>
  );
}
