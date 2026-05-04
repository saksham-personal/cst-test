import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ScreeningDetail, ScreeningSummary } from '../api/types';

export interface ScreenRecord {
  id: string;
  screenName: string;
  submitterName: string;
  incomingDate: string;        // ISO date string
  deadlineDate: string;        // ISO date string
  investmentCriteria: string;
  pipelineStatus: 'active' | 'paused' | 'completed';
  pipelineStep: string;        // e.g. "Criteria Analysis", "LLM Screening", "Form Intake"
  isOngoing: boolean;
  source: 'screenings-db' | 'local';
  screeningId?: string;
  originalFilename?: string;
  currFinalCriteria?: string | null;
}

interface ScreenState {
  /* The currently active screen (selected and in-progress) */
  activeScreen: ScreenRecord | null;

  /* All known screens */
  screens: ScreenRecord[];

  /* Actions */
  setActiveScreen: (screen: ScreenRecord | null) => void;
  clearActiveScreen: () => void;
  addScreen: (screen: ScreenRecord) => void;
  removeScreen: (id: string) => void;
  updateScreen: (id: string, patch: Partial<ScreenRecord>) => void;
  syncScreenings: (screenings: ScreeningSummary[]) => void;
  upsertScreeningDetail: (screening: ScreeningDetail) => void;
  activateScreeningDetail: (screening: ScreeningDetail) => void;
}

function displayScreeningName(screening: ScreeningSummary | ScreeningDetail): string {
  return screening.screen_name || screening.original_filename || screening.id;
}

function pipelineStepName(step: number, status: string): string {
  if (step <= 1) return 'Form Intake';
  if (step <= 4) return 'Criteria Analysis';
  if (status === 'LLM_SCREENING' || step >= 6) return 'LLM Screening';
  if (step === 5) return 'Search';
  return 'Criteria Analysis';
}

function toScreenRecord(screening: ScreeningSummary | ScreeningDetail): ScreenRecord {
  const anyScreening = screening as ScreeningDetail;
  const editedFields = anyScreening.edited_fields || {};
  const incomingDate = anyScreening.inbound_date || screening.updated_at?.slice(0, 10) || new Date().toISOString().slice(0, 10);
  const deadlineDate = anyScreening.target_date || incomingDate;
  return {
    id: screening.id,
    screeningId: screening.id,
    screenName: displayScreeningName(screening),
    submitterName: editedFields.submitter_name || 'Screen database',
    incomingDate,
    deadlineDate,
    investmentCriteria: editedFields.investment_criteria || anyScreening.curr_final_criteria || 'No criteria saved yet.',
    pipelineStatus: screening.status === 'screening_started' ? 'active' : 'paused',
    pipelineStep: pipelineStepName(screening.pipeline_step, screening.pipeline_status),
    isOngoing: screening.status !== 'screening_started' || screening.is_active,
    source: 'screenings-db',
    originalFilename: screening.original_filename,
    currFinalCriteria: anyScreening.curr_final_criteria ?? null,
  };
}

/* ── Mock seed data ── */
const SEED_SCREENS: ScreenRecord[] = [
  {
    id: 'scr-001',
    source: 'local',
    screenName: 'Clean Energy Fund II',
    submitterName: 'Sarah Chen',
    incomingDate: '2026-04-15',
    deadlineDate: '2026-05-20',
    investmentCriteria: 'Renewable energy companies with >$50M revenue in North America',
    pipelineStatus: 'active',
    pipelineStep: 'Criteria Analysis',
    isOngoing: true,
  },
  {
    id: 'scr-002',
    source: 'local',
    screenName: 'Healthcare Growth Equity',
    submitterName: 'James Rodriguez',
    incomingDate: '2026-04-10',
    deadlineDate: '2026-05-15',
    investmentCriteria: 'Digital health & medtech startups Series B+ with strong IP portfolio',
    pipelineStatus: 'completed',
    pipelineStep: 'LLM Screening',
    isOngoing: false,
  },
  {
    id: 'scr-003',
    source: 'local',
    screenName: 'European SaaS Buyout',
    submitterName: 'Laura Müller',
    incomingDate: '2026-04-20',
    deadlineDate: '2026-06-01',
    investmentCriteria: 'B2B SaaS companies in DACH region, ARR €10-50M, Rule of 40+',
    pipelineStatus: 'active',
    pipelineStep: 'Search',
    isOngoing: true,
  },
  {
    id: 'scr-004',
    source: 'local',
    screenName: 'Infrastructure Debt Screen',
    submitterName: 'Raj Patel',
    incomingDate: '2026-03-28',
    deadlineDate: '2026-04-30',
    investmentCriteria: 'Core infrastructure assets in transportation, utilities, and telecom',
    pipelineStatus: 'completed',
    pipelineStep: 'LLM Screening',
    isOngoing: false,
  },
  {
    id: 'scr-005',
    source: 'local',
    screenName: 'Asia-Pacific FinTech',
    submitterName: 'Yuki Tanaka',
    incomingDate: '2026-04-25',
    deadlineDate: '2026-06-10',
    investmentCriteria: 'Payments and lending platforms in SEA & ANZ markets',
    pipelineStatus: 'active',
    pipelineStep: 'Form Intake',
    isOngoing: true,
  },
  {
    id: 'scr-006',
    source: 'local',
    screenName: 'US Mid-Market Industrials',
    submitterName: 'Michael Thompson',
    incomingDate: '2026-04-02',
    deadlineDate: '2026-05-05',
    investmentCriteria: 'Manufacturing companies $100-500M EV, Midwest focus, strong EBITDA margins',
    pipelineStatus: 'paused',
    pipelineStep: 'Criteria Analysis',
    isOngoing: false,
  },
  {
    id: 'scr-007',
    source: 'local',
    screenName: 'ESG Impact Fund',
    submitterName: 'Amara Okafor',
    incomingDate: '2026-04-18',
    deadlineDate: '2026-05-30',
    investmentCriteria: 'Companies with verified ESG scores >80 and carbon-neutral targets by 2030',
    pipelineStatus: 'active',
    pipelineStep: 'Search',
    isOngoing: true,
  },
];

/* ── Route mapping for pipeline steps ── */
export const PIPELINE_STEP_ROUTES: Record<string, string> = {
  'Form Intake': '/screenings/new',
  'Criteria Analysis': '/criteria-analysis',
  'Search': '/search',
  'LLM Screening': '/llm-screening',
  'Output Compiled': '/output-compilation',
};

export const useScreenStore = create<ScreenState>()(
  persist(
    (set) => ({
      activeScreen: null,
      screens: SEED_SCREENS,

      setActiveScreen: (screen) => set({ activeScreen: screen }),
      clearActiveScreen: () => set({ activeScreen: null }),

      addScreen: (screen) =>
        set((state) => ({ screens: [screen, ...state.screens] })),

      removeScreen: (id) =>
        set((state) => ({
          screens: state.screens.filter((s) => s.id !== id),
          activeScreen: state.activeScreen?.id === id ? null : state.activeScreen,
        })),

      updateScreen: (id, patch) =>
        set((state) => ({
          screens: state.screens.map((s) => (s.id === id ? { ...s, ...patch } : s)),
          activeScreen:
            state.activeScreen?.id === id
              ? { ...state.activeScreen, ...patch }
              : state.activeScreen,
        })),

      syncScreenings: (screenings) =>
        set((state) => {
          const dbRecords = screenings.map(toScreenRecord);
          const dbIds = new Set(dbRecords.map((record) => record.id));
          const localRecords = state.screens.filter(
            (screen) => screen.source !== 'screenings-db' && !dbIds.has(screen.id),
          );
          const screens = [...dbRecords, ...localRecords];
          const activeScreen = state.activeScreen && dbIds.has(state.activeScreen.id)
            ? screens.find((screen) => screen.id === state.activeScreen?.id) ?? state.activeScreen
            : state.activeScreen;
          return { screens, activeScreen };
        }),

      upsertScreeningDetail: (screening) =>
        set((state) => {
          const record = toScreenRecord(screening);
          const screens = [record, ...state.screens.filter((screen) => screen.id !== record.id)];
          return {
            screens,
            activeScreen: state.activeScreen?.id === record.id ? record : state.activeScreen,
          };
        }),

      activateScreeningDetail: (screening) =>
        set((state) => {
          const record = toScreenRecord(screening);
          const screens = [record, ...state.screens.filter((screen) => screen.id !== record.id)];
          return {
            screens,
            activeScreen: record,
          };
        }),
    }),
    {
      name: 'company-screener-screens',
      partialize: (state) => ({
        activeScreen: state.activeScreen,
        screens: state.screens,
      }),
    }
  )
);
