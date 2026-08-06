export const PROJECT_STORAGE_KEY = 'neuropath:v1';
const VERSION = 1;

export type StoredProjectState = { version: number; projects: Record<string, unknown>[]; activeProjectId: string | null };

export function loadProjectState(): StoredProjectState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PROJECT_STORAGE_KEY);
    if (!raw) return { version: VERSION, projects: [], activeProjectId: null };
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    if (record.version !== VERSION || !Array.isArray(record.projects) || (record.activeProjectId !== null && typeof record.activeProjectId !== 'string')) {
      if (process.env.NODE_ENV === 'development') console.warn('Unsupported or malformed NeuroPath storage ignored.');
      return null;
    }
    return { version: VERSION, projects: record.projects.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object')), activeProjectId: record.activeProjectId as string | null };
  } catch {
    if (process.env.NODE_ENV === 'development') console.warn('Malformed NeuroPath storage ignored.');
    return null;
  }
}

export function saveProjectState(projects: unknown[], activeProjectId: string | null) {
  if (typeof window === 'undefined') return;
  const serializableProjects = projects.map((project) => {
    const record = project as Record<string, unknown>;
    return { ...record, attachments: Array.isArray(record.attachments) ? record.attachments.map((attachment) => { const item = attachment as Record<string, unknown>; return { id: item.id, name: item.name, type: item.type, size: item.size, status: item.status, message: item.message }; }) : [] };
  });
  window.localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify({ version: VERSION, projects: serializableProjects, activeProjectId }));
}
