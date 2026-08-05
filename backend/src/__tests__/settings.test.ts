import prisma from '../db';
import { getSetting, getSettingNumber, DEFAULT_SETTINGS } from '../utils/settings';

// Mock the prisma client so these tests run without a database.
jest.mock('../db', () => ({
  __esModule: true,
  default: {
    adminSetting: { findUnique: jest.fn() },
  },
}));

const mockDb = prisma as unknown as {
  adminSetting: { findUnique: jest.Mock };
};

describe('DEFAULT_SETTINGS', () => {
  it('defines a sane winning-rate contract', () => {
    expect(DEFAULT_SETTINGS.win_rate_percentage).toBe('50.00');
    expect(DEFAULT_SETTINGS.rtp_percentage).toBe('90.00');
    expect(DEFAULT_SETTINGS.jackpot_chance).toBe('5.00');
    expect(DEFAULT_SETTINGS.jackpot_amount).toBe('100.00');
    expect(DEFAULT_SETTINGS.number_calling_speed).toBe('4');
  });
});

describe('getSetting', () => {
  it('returns the DB value when the setting exists', async () => {
    mockDb.adminSetting.findUnique.mockResolvedValue({
      key: 'win_rate_percentage',
      value: '65.00',
    });

    const value = await getSetting('win_rate_percentage');
    expect(value).toBe('65.00');
    expect(mockDb.adminSetting.findUnique).toHaveBeenCalledWith({
      where: { key: 'win_rate_percentage' },
    });
  });

  it('falls back to the default when the setting is not configured', async () => {
    mockDb.adminSetting.findUnique.mockResolvedValue(null);

    const value = await getSetting('win_rate_percentage');
    expect(value).toBe('50.00');
  });

  it('falls back to the default when the DB lookup throws', async () => {
    mockDb.adminSetting.findUnique.mockRejectedValue(new Error('db down'));

    const value = await getSetting('win_rate_percentage');
    expect(value).toBe('50.00');
  });

  it('returns an empty string for an unknown key when the DB lookup throws', async () => {
    mockDb.adminSetting.findUnique.mockRejectedValue(new Error('db down'));

    const value = await getSetting('nonexistent_key');
    expect(value).toBe('');
  });
});

describe('getSettingNumber', () => {
  it('parses the stored value as a float', async () => {
    mockDb.adminSetting.findUnique.mockResolvedValue({
      key: 'win_rate_percentage',
      value: '62.5',
    });

    await expect(getSettingNumber('win_rate_percentage')).resolves.toBe(62.5);
  });

  it('returns the default win rate when the setting is unset', async () => {
    mockDb.adminSetting.findUnique.mockResolvedValue(null);

    await expect(getSettingNumber('win_rate_percentage')).resolves.toBe(50);
  });

  it('returns 0 when the value cannot be parsed', async () => {
    mockDb.adminSetting.findUnique.mockResolvedValue({
      key: 'win_rate_percentage',
      value: 'not-a-number',
    });

    await expect(getSettingNumber('win_rate_percentage')).resolves.toBe(0);
  });

  it('parses DB-configured rtp_percentage and jackpot_chance values', async () => {
    mockDb.adminSetting.findUnique.mockImplementation(async ({ where }: { where: { key: string } }) => {
      const values: Record<string, string> = { rtp_percentage: '95', jackpot_chance: '12.5' };
      return values[where.key] ? { key: where.key, value: values[where.key] } : null;
    });

    await expect(getSettingNumber('rtp_percentage')).resolves.toBe(95);
    await expect(getSettingNumber('jackpot_chance')).resolves.toBe(12.5);
  });

  it('falls back to the rtp/jackpot defaults when not stored', async () => {
    mockDb.adminSetting.findUnique.mockResolvedValue(null);

    await expect(getSettingNumber('rtp_percentage')).resolves.toBe(90);
    await expect(getSettingNumber('jackpot_chance')).resolves.toBe(5);
    await expect(getSettingNumber('jackpot_amount')).resolves.toBe(100);
    await expect(getSettingNumber('number_calling_speed')).resolves.toBe(4);
  });
});
