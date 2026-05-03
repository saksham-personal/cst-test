import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
}

/* ── Mock seed data ── */
const SEED_SCREENS: ScreenRecord[] = [
  {
    id: 'scr-001',
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
