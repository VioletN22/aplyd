import { contextBridge, ipcRenderer } from 'electron';
import { JobApplication, Workflow, AnswerBankEntry, LockerDocument, VoiceNote, VoiceNoteKind, PortfolioLink, CoverLetter } from '../shared/types';

// Define the API object
const electronAPI = {
  // Database operations
  db: {
    getAllApplications: (filters?: any) => ipcRenderer.invoke('db:getAllApplications', filters),
    getApplication: (id: string) => ipcRenderer.invoke('db:getApplication', id),
    updateApplication: (id: string, updates: Partial<JobApplication>) =>
      ipcRenderer.invoke('db:updateApplication', id, updates),
    deleteApplication: (id: string) => ipcRenderer.invoke('db:deleteApplication', id),
    getStageHistory: (applicationId: string) =>
      ipcRenderer.invoke('db:getStageHistory', applicationId),
    createStageHistory: (applicationId: string, stage: string, notes?: string) =>
      ipcRenderer.invoke('db:createStageHistory', applicationId, stage, notes),
    updateStageHistory: (id: string, updates: any) =>
      ipcRenderer.invoke('db:updateStageHistory', id, updates),
    getGuidanceDocs: (applicationId: string, stage: string) =>
      ipcRenderer.invoke('db:getGuidanceDocs', applicationId, stage),
    getAllWorkflows: () => ipcRenderer.invoke('db:getAllWorkflows'),
    createWorkflow: (company: string, name: string, stages: string[], isDefault: boolean) =>
      ipcRenderer.invoke('db:createWorkflow', company, name, stages, isDefault),
    updateWorkflow: (id: string, updates: Partial<Workflow>) =>
      ipcRenderer.invoke('db:updateWorkflow', id, updates),
    deleteWorkflow: (id: string) => ipcRenderer.invoke('db:deleteWorkflow', id),
  },

  // File operations
  file: {
    selectFile: () => ipcRenderer.invoke('file:selectFile'),
  },

  // Claude operations
  claude: {
    ingestJobListing: (jobListingText: string, company: string, jobSource?: string | null) =>
      ipcRenderer.invoke('claude:ingestJobListing', jobListingText, company, jobSource ?? null),
    checkAuth: () => ipcRenderer.invoke('claude:checkAuth'),
  },

  // Application flow (Sankey) data
  flow: {
    getData: () => ipcRenderer.invoke('flow:getData'),
  },

  // Per-application chat assistant
  chat: {
    getMessages: (applicationId: string) => ipcRenderer.invoke('chat:getMessages', applicationId),
    send: (applicationId: string, message: string) =>
      ipcRenderer.invoke('chat:send', applicationId, message),
  },

  // Per-application cover letter: live company research + full personal context,
  // generate / refine-with-feedback / copy, persisted on the application.
  coverLetter: {
    getForApp: (applicationId: string): Promise<CoverLetter | null> => ipcRenderer.invoke('coverletter:getForApp', applicationId),
    generate: (opts: { applicationId: string; company: string; role: string; jobText?: string; jobUrl?: string; location?: string }): Promise<{ body: string; note?: string; researched: boolean; sources: string[]; error?: string }> =>
      ipcRenderer.invoke('coverletter:generate', opts),
    onProgress: (cb: (p: { applicationId: string; stage: string; message: string }) => void) => {
      const h = (_e: any, p: any) => cb(p);
      ipcRenderer.on('coverletter:progress', h);
      return () => ipcRenderer.removeListener('coverletter:progress', h);
    },
    refine: (opts: { applicationId: string; company: string; role: string; body: string; feedback: string; remember?: boolean; jobUrl?: string }): Promise<{ body: string; note?: string; error?: string }> =>
      ipcRenderer.invoke('coverletter:refine', opts),
    saveForApp: (opts: { applicationId: string; company: string; role: string; jobUrl?: string; body: string }): Promise<CoverLetter> =>
      ipcRenderer.invoke('coverletter:saveForApp', opts),
    // Save a version you like → BOTH aplyd's vault and a labelled PDF on disk.
    saveVersion: (opts: { applicationId: string; company: string; role: string; jobUrl?: string; body: string; label?: string }): Promise<{ version: CoverLetter; pdfPath: string }> =>
      ipcRenderer.invoke('coverletter:saveVersion', opts),
    getVersions: (applicationId: string): Promise<CoverLetter[]> => ipcRenderer.invoke('coverletter:getVersions', applicationId),
    deleteVersion: (id: string): Promise<{ ok: boolean }> => ipcRenderer.invoke('coverletter:deleteVersion', id),
    getDir: (): Promise<string> => ipcRenderer.invoke('coverletter:getDir'),
    setDir: (): Promise<{ dir: string }> => ipcRenderer.invoke('coverletter:setDir'),
    openFolder: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('coverletter:openFolder'),
  },
  setup: {
    getAnswerBank: (): Promise<AnswerBankEntry[]> => ipcRenderer.invoke('setup:getAnswerBank'),
    upsertAnswer: (entry: Partial<AnswerBankEntry> & { label: string; value: string }): Promise<AnswerBankEntry> =>
      ipcRenderer.invoke('setup:upsertAnswer', entry),
    deleteAnswer: (id: string) => ipcRenderer.invoke('setup:deleteAnswer', id),
    getDocuments: (): Promise<LockerDocument[]> => ipcRenderer.invoke('setup:getDocuments'),
    pickDocument: (): Promise<string | null> => ipcRenderer.invoke('setup:pickDocument'),
    addDocument: (label: string, filePath: string, tags: string[], isDefault: boolean): Promise<LockerDocument> =>
      ipcRenderer.invoke('setup:addDocument', label, filePath, tags, isDefault),
    deleteDocument: (id: string) => ipcRenderer.invoke('setup:deleteDocument', id),
    setDocumentDefault: (id: string) => ipcRenderer.invoke('setup:setDocumentDefault', id),
    getResumeFocus: (): Promise<Record<string, string>> => ipcRenderer.invoke('setup:getResumeFocus'),
    setResumeFocus: (docId: string, focus: string) => ipcRenderer.invoke('setup:setResumeFocus', docId, focus),
    getVoiceNotes: (): Promise<VoiceNote[]> => ipcRenderer.invoke('setup:getVoiceNotes'),
    addVoiceNote: (kind: VoiceNoteKind, note: string): Promise<VoiceNote> =>
      ipcRenderer.invoke('setup:addVoiceNote', kind, note),
    deleteVoiceNote: (id: string) => ipcRenderer.invoke('setup:deleteVoiceNote', id),
    getPortfolioLinks: (): Promise<PortfolioLink[]> => ipcRenderer.invoke('setup:getPortfolioLinks'),
    addPortfolioLink: (label: string, url: string): Promise<PortfolioLink> =>
      ipcRenderer.invoke('setup:addPortfolioLink', label, url),
    deletePortfolioLink: (id: string) => ipcRenderer.invoke('setup:deletePortfolioLink', id),
    getCoverLetters: (): Promise<CoverLetter[]> => ipcRenderer.invoke('setup:getCoverLetters'),
    saveCoverLetter: (input: Partial<CoverLetter> & { company: string; role: string; body: string }): Promise<CoverLetter> =>
      ipcRenderer.invoke('setup:saveCoverLetter', input),
    deleteCoverLetter: (id: string) => ipcRenderer.invoke('setup:deleteCoverLetter', id),
    generateCoverLetter: (opts: { company: string; role: string; jobText?: string }): Promise<{ body: string }> =>
      ipcRenderer.invoke('setup:generateCoverLetter', opts),
    refineCoverLetter: (opts: { company: string; role: string; body: string; feedback: string; remember?: boolean }): Promise<{ body: string }> =>
      ipcRenderer.invoke('setup:refineCoverLetter', opts),
  },

  // Structured profile (Core)
  profile: {
    get: (): Promise<Record<string, string>> => ipcRenderer.invoke('setup:profile:get'),
    set: (profile: Record<string, string>): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('setup:profile:set', profile),
    seed: (): Promise<Record<string, string>> => ipcRenderer.invoke('setup:profile:seed'),
  },

  // Quick add operation
  quickAddApplication: (company: string, jobTitle: string, jobSource?: string | null) =>
    ipcRenderer.invoke('quickAddApplication', company, jobTitle, jobSource ?? null),

  // Legacy shortcuts for backwards compatibility
  getAllApplications: (filters?: any) => ipcRenderer.invoke('db:getAllApplications', filters),
  selectFile: () => ipcRenderer.invoke('file:selectFile'),
};

// Expose in main world
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

export type ElectronAPI = typeof electronAPI;

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
