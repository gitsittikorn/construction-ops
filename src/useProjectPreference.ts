import { useEffect, useRef, useState } from 'react';
import type { Project } from './models';
import {
  loadProjectPreference,
  preferredProject,
  saveProjectPreference,
} from './projectPreference';
import { connectionMessage } from './async';
export function useProjectPreference(owner: string, projects: Project[]) {
  const [state, setState] = useState({ owner: '', id: '', ready: false, saving: false, error: '' });
  const currentOwner = useRef(owner),
    locked = useRef(false);
  currentOwner.current = owner;
  useEffect(() => {
    let active = true;
    void loadProjectPreference(owner)
      .then((id) => {
        if (active) setState({ owner, id, ready: true, saving: false, error: '' });
      })
      .catch((error) => {
        if (active)
          setState({ owner, id: '', ready: true, saving: false, error: connectionMessage(error) });
      });
    return () => {
      active = false;
    };
  }, [owner]);
  async function save(id: string) {
    if (locked.current || currentOwner.current !== owner) return;
    locked.current = true;
    setState((state) => ({ ...state, saving: true, error: '' }));
    try {
      await saveProjectPreference(owner, id, projects);
      if (currentOwner.current === owner)
        setState({ owner, id, ready: true, saving: false, error: '' });
    } catch (error) {
      if (currentOwner.current === owner)
        setState((state) => ({ ...state, saving: false, error: connectionMessage(error) }));
    } finally {
      locked.current = false;
    }
  }
  return {
    id: state.owner === owner ? preferredProject(projects, state.id) : '',
    ready: state.owner === owner && state.ready,
    saving: state.owner === owner && state.saving,
    error: state.owner === owner ? state.error : '',
    save,
  };
}
