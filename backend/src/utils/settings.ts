import prisma from '../db';

export const DEFAULT_SETTINGS: Record<string, string> = {
  welcome_bonus: '10.00',
  referral_bonus: '5.00',
  referral_commission_pct: '10.00',
  win_rate_percentage: '50.00',
  rtp_percentage: '90.00',
  bot_difficulty: '1',
  number_calling_speed: '4', // seconds per ball call
  jackpot_chance: '5.00', // 5% chance of jackpot addition
  keno_max_spots: '10', // max spots a player can pick in Keno
  keno_draw_size: '20', // how many numbers are drawn per Keno round
};

export const getSetting = async (key: string): Promise<string> => {
  try {
    const setting = await prisma.adminSetting.findUnique({
      where: { key },
    });
    return setting ? setting.value : DEFAULT_SETTINGS[key] || '';
  } catch (error) {
    return DEFAULT_SETTINGS[key] || '';
  }
};

export const getSettingNumber = async (key: string): Promise<number> => {
  const value = await getSetting(key);
  return parseFloat(value) || 0;
};
