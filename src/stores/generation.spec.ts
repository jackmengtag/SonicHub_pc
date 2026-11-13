import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { CreateGenerationRequest, Generation, Quote, QuoteRequest, Work } from '../types/api';
import {
  createGeneration,
  createQuote,
  getGeneration,
  getWork,
} from '../api/modules';
import {
  ACTIVE_GENERATION_KEY,
  GENERATION_POLL_INTERVAL,
  MAX_GENERATION_POLL_FAILURES,
  useGenerationStore,
} from './generation';

vi.mock('../api/modules', () => ({
  cancelGeneration: vi.fn(),
  createGeneration: vi.fn(),
  createQuote: vi.fn(),
  getGeneration: vi.fn(),
  getMe: vi.fn(),
  getWork: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  publishWork: vi.fn(),
  updateMe: vi.fn(),
}));

const quoteInput: QuoteRequest = {
  styles: ['电子'],
  duration_seconds: 30,
  quality: '标准',
  stems: false,
};

const generationInput: CreateGenerationRequest = {
  quote_id: 'quote-1',
  prompt: '雨后的城市',
  lyrics: '',
  styles: ['电子'],
  mood: '',
  duration_seconds: 30,
  vocal: '女声',
  quality: '标准',
  stems: false,
  title: '雨后的城市',
  visibility: 'public',
  auto_publish: false,
};

function makeQuote(id: string): Quote {
  return {
    quote_id: id,
    base: 10,
    quality_fee: 0,
    stems_fee: 0,
    duration_fee: 0,
    total: 10,
    status: 'valid',
    expires_at: '2099-01-01T00:00:00Z',
  };
}

function makeGeneration(status: string): Generation {
  return {
    id: 'generation-1',
    status,
    stage: status === 'succeeded' ? 'completed' : 'generating',
    progress: status === 'succeeded' ? 100 : 12,
    prompt: '雨后的城市',
    lyrics: '',
    styles: ['电子'],
    mood: '',
    duration_seconds: 30,
    vocal: '女声',
    quality: '标准',
    stems: false,
    title: '雨后的城市',
    visibility: 'public',
    auto_publish: false,
    model_version: 'test-model',
    work_id: status === 'succeeded' ? 'work-1' : undefined,
    created_at: '2026-01-01T00:00:00Z',
  };
}

const resultWork = {
  id: 'work-1',
  title: '雨后的城市',
  audio_url: '/media/generated/work-1.wav',
  duration_seconds: 30,
  tags: ['电子'],
} as Work;

beforeEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  window.localStorage.clear();
  setActivePinia(createPinia());
});

afterEach(() => {
  vi.useRealTimers();
});

describe('generation store', () => {
  it('ignores a stale quote response after a newer quote succeeds', async () => {
    let resolveFirst!: (quote: Quote) => void;
    vi.mocked(createQuote)
      .mockImplementationOnce(() => new Promise<Quote>((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce(makeQuote('new-quote'));
    const store = useGenerationStore();

    const firstRequest = store.fetchQuote(quoteInput);
    await store.fetchQuote({ ...quoteInput, duration_seconds: 60 });
    resolveFirst(makeQuote('old-quote'));
    await firstRequest;

    expect(store.quote?.quote_id).toBe('new-quote');
    expect(store.quoteError).toBe('');
  });

  it('tracks real server progress, loads the generated work and clears recovery state', async () => {
    let resolvePoll!: (generation: Generation) => void;
    vi.mocked(createGeneration).mockResolvedValue(makeGeneration('running'));
    vi.mocked(getGeneration).mockImplementation(() => new Promise<Generation>((resolve) => {
      resolvePoll = resolve;
    }));
    vi.mocked(getWork).mockResolvedValue(resultWork);
    const store = useGenerationStore();

    await store.startGeneration(generationInput);
    expect(store.progress).toBe(12);
    expect(window.localStorage.getItem(ACTIVE_GENERATION_KEY)).toBe('generation-1');

    resolvePoll(makeGeneration('succeeded'));
    await vi.waitFor(() => expect(store.work?.id).toBe('work-1'));

    expect(store.generation?.status).toBe('succeeded');
    expect(store.progress).toBe(100);
    expect(getWork).toHaveBeenCalledWith('work-1');
    expect(store.activeId).toBe('');
    expect(window.localStorage.getItem(ACTIVE_GENERATION_KEY)).toBeNull();
  });

  it('stops after repeated polling failures without deleting the recoverable task ID', async () => {
    vi.useFakeTimers();
    window.localStorage.setItem(ACTIVE_GENERATION_KEY, 'generation-1');
    vi.mocked(getGeneration).mockRejectedValue(new Error('offline'));
    const store = useGenerationStore();

    await store.restoreActiveGeneration();
    for (let index = 1; index < MAX_GENERATION_POLL_FAILURES; index += 1) {
      await vi.advanceTimersByTimeAsync(GENERATION_POLL_INTERVAL);
    }

    expect(getGeneration).toHaveBeenCalledTimes(MAX_GENERATION_POLL_FAILURES);
    expect(store.polling).toBe(false);
    expect(store.pollStopped).toBe(true);
    expect(store.activeId).toBe('generation-1');
    expect(window.localStorage.getItem(ACTIVE_GENERATION_KEY)).toBe('generation-1');
    expect(store.pollError).toContain('任务可能仍在后台运行');
  });
});
