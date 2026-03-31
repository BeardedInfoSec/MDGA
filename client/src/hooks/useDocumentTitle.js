import { useEffect } from 'react';

export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title || 'Make Durotar Great Again | #1 PvP Guild NA';
  }, [title]);
}
