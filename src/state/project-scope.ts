import { create } from 'zustand';
import { useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { SERVER_MODE } from '../app/create-storage';
import { authClient } from '../app/auth-client';
import {
  parseScopeParam,
  parseStoredPref,
  resolveScope,
  scopeLabel,
  scopeParam,
  type Scope,
  type ScopePref,
} from '../domain/projectScope';
import type { Project } from '../domain/schema';
import { useCurrentUser } from './current-user';
import { useMembers, useProjects } from './queries';
import { useSession } from './session';

// Выбор проектов (ADR-016). Источники: адрес страницы (?projects=…), сохранённый выбор пользователя
// (с сервером — в его учётке, в демо — в браузере), проект из адреса /projects/:key/….

const KEY = 'team-tracker:projects';

function readLocal(): ScopePref | null {
  try {
    return parseStoredPref(window.localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

interface DemoPref {
  saved: ScopePref | null;
  set: (pref: ScopePref) => void;
}

/** Сохранённый выбор в демо-режиме (без сервера): в localStorage браузера. */
const useDemoPref = create<DemoPref>((set) => ({
  saved: readLocal(),
  set: (pref) => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(pref));
    } catch {
      // выбор действует, но не запомнится в этом браузере
    }
    set({ saved: pref });
  },
}));

export interface ProjectScopeState {
  /** Данные загружены; пока нет, `scope.projects` пуст. */
  ready: boolean;
  scope: Scope;
  /** Все проекты (для списка выбора). */
  all: Project[];
  label: string;
  /** Меняет выбор: адрес страницы и сохранённый выбор. */
  choose: (pref: ScopePref) => Promise<void>;
}

export function useProjectScope(): ProjectScopeState {
  const projects = useProjects();
  const members = useMembers();
  const { key } = useParams();
  const [params, setParams] = useSearchParams();
  const me = useCurrentUser();
  const account = useSession((s) => s.account);
  const setAccount = useSession((s) => s.set);
  const demoSaved = useDemoPref((s) => s.saved);
  const setDemo = useDemoPref((s) => s.set);

  const all = useMemo(() => projects.data ?? [], [projects.data]);
  const urlParam = params.get('projects');
  const saved = SERVER_MODE ? (account?.projectFilter ?? null) : demoSaved;
  const current = key ? all.find((p) => p.key === key) : undefined;
  const memberList = useMemo(() => members.data ?? [], [members.data]);
  const personId = me?.id ?? null;

  const scope = useMemo(
    () =>
      resolveScope({
        projects: all,
        members: memberList,
        personId,
        fromUrl: parseScopeParam(urlParam),
        saved,
        current,
      }),
    [all, memberList, personId, urlParam, saved, current],
  );

  const choose = async (pref: ScopePref) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('projects', scopeParam(pref));
        return next;
      },
      { replace: true },
    );
    if (SERVER_MODE && account) {
      try {
        setAccount(await authClient.setProjectFilter(pref));
      } catch {
        // выбор действует на этой странице, но не сохранился: повторится при следующем выборе
      }
    } else if (!SERVER_MODE) {
      setDemo(pref);
    }
  };

  return {
    ready: Boolean(projects.data && members.data),
    scope,
    all,
    label: scopeLabel(scope, all.length),
    choose,
  };
}
