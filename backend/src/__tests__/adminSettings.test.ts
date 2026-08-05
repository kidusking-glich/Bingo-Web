import { Response } from 'express';
import prisma from '../db';
import { getSettings, updateSettings } from '../controllers/adminController';

// Mock the prisma client so these tests run without a database.
jest.mock('../db', () => ({
  __esModule: true,
  default: {
    adminSetting: { findMany: jest.fn(), upsert: jest.fn() },
    adminActivityLog: { create: jest.fn() },
    $transaction: jest.fn(),
  },
}));

const mockDb = prisma as unknown as {
  adminSetting: { findMany: jest.Mock; upsert: jest.Mock };
  adminActivityLog: { create: jest.Mock };
  $transaction: jest.Mock;
};

const makeReq = (body: Record<string, unknown>) => ({
  body,
  user: { id: 'admin-1', email: 'admin@x.com', username: 'Admin', role: 'ADMIN' as const },
});

const makeRes = () => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  return res as unknown as Response;
};

beforeEach(() => {
  // updateSettings passes an array of upsert promises to $transaction
  mockDb.$transaction.mockImplementation((promises: Promise<unknown>[]) => Promise.all(promises));
});

describe('getSettings', () => {
  it('returns the default settings when nothing is stored in the DB', async () => {
    mockDb.adminSetting.findMany.mockResolvedValue([]);

    const res = makeRes();
    await getSettings(makeReq({}) as any, res);

    expect(res.json).toHaveBeenCalledWith({
      settings: expect.objectContaining({
        win_rate_percentage: '50.00',
        rtp_percentage: '90.00',
        welcome_bonus: '10.00',
      }),
    });
  });

  it('merges DB overrides on top of the defaults (win rate override wins)', async () => {
    mockDb.adminSetting.findMany.mockResolvedValue([
      { key: 'win_rate_percentage', value: '65.00' },
      { key: 'jackpot_chance', value: '8.00' },
    ]);

    const res = makeRes();
    await getSettings(makeReq({}) as any, res);

    expect(res.json).toHaveBeenCalledWith({
      settings: expect.objectContaining({
        win_rate_percentage: '65.00',
        jackpot_chance: '8.00',
        // unconfigured keys still fall back to defaults
        welcome_bonus: '10.00',
        rtp_percentage: '90.00',
      }),
    });
  });

  it('responds 500 when the DB lookup fails', async () => {
    mockDb.adminSetting.findMany.mockRejectedValue(new Error('db down'));

    const res = makeRes();
    await getSettings(makeReq({}) as any, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'db down' });
  });
});

describe('updateSettings', () => {
  it('returns 400 when the settings object is missing', async () => {
    const res = makeRes();
    await updateSettings(makeReq({}) as any, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Settings object is required' });
    expect(mockDb.adminSetting.upsert).not.toHaveBeenCalled();
  });

  it('returns 400 when settings is not an object', async () => {
    const res = makeRes();
    await updateSettings(makeReq({ settings: '50.00' }) as any, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Settings object is required' });
  });

  it('upserts every provided key and logs the admin activity', async () => {
    mockDb.adminSetting.upsert.mockResolvedValue({ key: 'win_rate_percentage', value: '60.00' });
    mockDb.adminActivityLog.create.mockResolvedValue({});

    const res = makeRes();
    await updateSettings(
      makeReq({ settings: { win_rate_percentage: '60.00', rtp_percentage: '92.00' } }) as any,
      res
    );

    expect(mockDb.adminSetting.upsert).toHaveBeenCalledWith({
      where: { key: 'win_rate_percentage' },
      update: { value: '60.00' },
      create: { key: 'win_rate_percentage', value: '60.00' },
    });
    expect(mockDb.adminSetting.upsert).toHaveBeenCalledWith({
      where: { key: 'rtp_percentage' },
      update: { value: '92.00' },
      create: { key: 'rtp_percentage', value: '92.00' },
    });
    // both upserts run inside a single transaction
    expect(mockDb.$transaction).toHaveBeenCalledWith(expect.any(Array));

    expect(mockDb.adminActivityLog.create).toHaveBeenCalledWith({
      data: {
        adminId: 'admin-1',
        action: 'Updated settings: win_rate_percentage, rtp_percentage',
      },
    });
    expect(res.json).toHaveBeenCalledWith({ message: 'Settings updated successfully' });
  });

  it('coerces numeric values to strings before persisting', async () => {
    mockDb.adminSetting.upsert.mockResolvedValue({});
    mockDb.adminActivityLog.create.mockResolvedValue({});

    const res = makeRes();
    await updateSettings(makeReq({ settings: { win_rate_percentage: 55 } }) as any, res);

    expect(mockDb.adminSetting.upsert).toHaveBeenCalledWith({
      where: { key: 'win_rate_percentage' },
      update: { value: '55' },
      create: { key: 'win_rate_percentage', value: '55' },
    });
    expect(res.json).toHaveBeenCalledWith({ message: 'Settings updated successfully' });
  });

  it('persists every other game setting alongside the win rate (full payload)', async () => {
    mockDb.adminSetting.upsert.mockResolvedValue({});
    mockDb.adminActivityLog.create.mockResolvedValue({});

    const res = makeRes();
    await updateSettings(
      makeReq({
        settings: {
          win_rate_percentage: '60.00',
          rtp_percentage: '92.00',
          jackpot_chance: '8.00',
          jackpot_amount: '250.00',
          bot_difficulty: '3',
          number_calling_speed: '2',
          welcome_bonus: '15.00',
          referral_bonus: '7.50',
          referral_commission_pct: '12.50',
          keno_max_spots: '12',
          keno_draw_size: '25',
        },
      }) as any,
      res
    );

    expect(mockDb.adminSetting.upsert).toHaveBeenCalledTimes(11);
    for (const key of [
      'win_rate_percentage',
      'rtp_percentage',
      'jackpot_chance',
      'jackpot_amount',
      'bot_difficulty',
      'number_calling_speed',
      'welcome_bonus',
      'referral_bonus',
      'referral_commission_pct',
      'keno_max_spots',
      'keno_draw_size',
    ]) {
      expect(mockDb.adminSetting.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { key } })
      );
    }
    expect(mockDb.adminActivityLog.create).toHaveBeenCalledWith({
      data: {
        adminId: 'admin-1',
        action: expect.stringContaining('rtp_percentage'),
      },
    });
    expect(res.json).toHaveBeenCalledWith({ message: 'Settings updated successfully' });
  });

  it('round-trips rtp_percentage and jackpot settings through update then get', async () => {
    // 1. Admin saves RTP 92%, jackpot chance 8% and amount $250
    mockDb.adminSetting.upsert.mockImplementation(async ({ where, update }: any) => ({
      key: where.key,
      value: update.value,
    }));
    mockDb.adminActivityLog.create.mockResolvedValue({});

    await updateSettings(
      makeReq({ settings: { rtp_percentage: '92.00', jackpot_chance: '8.00', jackpot_amount: '250.00' } }) as any,
      makeRes()
    );

    // 2. The stored rows are exactly what the next getSettings call returns
    mockDb.adminSetting.findMany.mockResolvedValue([
      { key: 'rtp_percentage', value: '92.00' },
      { key: 'jackpot_chance', value: '8.00' },
      { key: 'jackpot_amount', value: '250.00' },
    ]);

    const res = makeRes();
    await getSettings(makeReq({}) as any, res);

    expect(res.json).toHaveBeenCalledWith({
      settings: expect.objectContaining({
        rtp_percentage: '92.00',
        jackpot_chance: '8.00',
        jackpot_amount: '250.00',
        win_rate_percentage: '50.00', // untouched default
      }),
    });
  });

  it('responds 500 when the DB write fails', async () => {
    mockDb.adminSetting.upsert.mockRejectedValue(new Error('write failed'));

    const res = makeRes();
    await updateSettings(makeReq({ settings: { win_rate_percentage: '60.00' } }) as any, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'write failed' });
  });
});
