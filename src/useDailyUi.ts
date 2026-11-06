import { useEffect, useRef, useState } from 'react';
import { loadDailyUi, saveDailyUi, type DailyUiState } from './dailyDrafts';
import { workDate } from './domain';

export function useDailyUi(owner: string, project: string) {
  const [state, setState] = useState<DailyUiState>({
    project,
    date: workDate(),
    reason: '',
    drafts: {},
  });
  const [ready, setReady] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState('');
  const current = useRef(state),
    generation = useRef(0);
  useEffect(() => {
    let active = true;
    void loadDailyUi(owner)
      .then((stored) => {
        if (!active) return;
        if (stored) {
          current.current = stored;
          setState(stored);
        }
        setReady(true);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      active = false;
    };
  }, [owner]);
  function update(change: (previous: DailyUiState) => DailyUiState) {
    const next = change(current.current),
      version = ++generation.current;
    current.current = next;
    setState(next);
    setSaving(true);
    setError('');
    void saveDailyUi(owner, next)
      .then(() => {
        if (version === generation.current) setSaving(false);
      })
      .catch((e) => {
        if (version === generation.current) {
          setSaving(false);
          setError(`เก็บร่างไม่สำเร็จ: ${e instanceof Error ? e.message : String(e)}`);
        }
      });
  }
  return { state, update, ready, saving, error };
}
