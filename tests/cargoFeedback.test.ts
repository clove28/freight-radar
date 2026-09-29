import { describe, expect, it } from 'vitest';
import { feedbackIsPositive, feedbackCounts, type CargoFeedback } from '../src/core/cargoFeedback.js';
import { MockCargoFeedbackRepository } from '../src/data/mock.js';

const fb = (over: Partial<CargoFeedback>): CargoFeedback => ({
  id: `f-${Math.random().toString(36).slice(2, 6)}`,
  cargoId: 'C1',
  driverId: 'd1',
  loadWaitHours: 1,
  loadDifficulty: 'easy',
  unloadDifficulty: 'easy',
  entranceTips: '',
  parkingTips: '',
  comment: '',
  createdAt: 0,
  ...over,
});

describe('cargoFeedback 核心（确定性判定）', () => {
  it('装货等待长（>3h）→ 负面', () => {
    expect(feedbackIsPositive(fb({ loadWaitHours: 5 }))).toBe(false);
  });

  it('装卸难 → 负面', () => {
    expect(feedbackIsPositive(fb({ loadDifficulty: 'hard' }))).toBe(false);
    expect(feedbackIsPositive(fb({ unloadDifficulty: 'hard' }))).toBe(false);
  });

  it('等待短且不难 → 正面', () => {
    expect(feedbackIsPositive(fb({ loadWaitHours: 1, loadDifficulty: 'medium' }))).toBe(true);
  });

  it('feedbackCounts 计数', () => {
    const list = [fb({ loadWaitHours: 1 }), fb({ loadWaitHours: 5 })];
    expect(feedbackCounts(list)).toEqual({ positive: 1, negative: 1 });
  });
});

describe('MockCargoFeedbackRepository', () => {
  it('add + listByCargo', async () => {
    const r = new MockCargoFeedbackRepository();
    await r.add(fb({ id: 'f1', cargoId: 'C1' }));
    await r.add(fb({ id: 'f2', cargoId: 'C2' }));
    expect((await r.listByCargo('C1')).length).toBe(1);
    expect((await r.listByCargo('C2')).length).toBe(1);
  });
});
