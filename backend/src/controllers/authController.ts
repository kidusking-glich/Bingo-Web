import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../db';
import { getSettingNumber } from '../utils/settings';
import { AuthRequest } from '../middlewares/auth';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-bingo-12345';

// Helper to generate referral code
const generateReferralCode = (): string => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};

export const register = async (req: Request, res: Response) => {
  try {
    const { email, username, password, referralCode } = req.body;

    if (!email || !username || !password) {
      return res.status(400).json({ error: 'Email, username, and password are required' });
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { username }],
      },
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Email or username already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const selfReferralCode = generateReferralCode();

    // Check if referral code is provided and valid
    let referrerId: string | null = null;
    if (referralCode) {
      const referrer = await prisma.user.findUnique({
        where: { referralCode: referralCode.toUpperCase() },
      });
      if (referrer) {
        referrerId = referrer.id;
      } else {
        return res.status(400).json({ error: 'Invalid referral code' });
      }
    }

    // Settings
    const welcomeBonus = await getSettingNumber('welcome_bonus');
    const referralBonus = await getSettingNumber('referral_bonus');

    // Run creation in transaction
    const newUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          username,
          passwordHash,
          referralCode: selfReferralCode,
          referredById: referrerId,
          isVerified: false, // Email verification token mock
          verificationToken: Math.random().toString(36).substring(2, 15),
        },
      });

      // Create wallet
      await tx.wallet.create({
        data: {
          userId: user.id,
          balance: welcomeBonus,
        },
      });

      // Log welcome bonus transaction
      if (welcomeBonus > 0) {
        await tx.transaction.create({
          data: {
            userId: user.id,
            type: 'WELCOME_BONUS',
            amount: welcomeBonus,
            status: 'COMPLETED',
            description: 'Welcome bonus for joining the platform',
          },
        });

        // Add welcome notification
        await tx.notification.create({
          data: {
            userId: user.id,
            title: 'Welcome Bonus Claimed!',
            message: `You have received a welcome bonus of $${welcomeBonus.toFixed(2)}.`,
          },
        });
      }

      // Distribute referral bonus to referrer
      if (referrerId && referralBonus > 0) {
        // Increment referrer wallet
        await tx.wallet.update({
          where: { userId: referrerId },
          data: {
            balance: { increment: referralBonus },
            referralEarnings: { increment: referralBonus },
          },
        });

        // Create transaction log for referrer
        await tx.transaction.create({
          data: {
            userId: referrerId,
            type: 'REFERRAL_BONUS',
            amount: referralBonus,
            status: 'COMPLETED',
            description: `Referral bonus for inviting ${username}`,
          },
        });

        // Log referral earning record
        await tx.referralEarning.create({
          data: {
            userId: referrerId,
            referredId: user.id,
            amount: referralBonus,
          },
        });

        // Notification for referrer
        await tx.notification.create({
          data: {
            userId: referrerId,
            title: 'Referral Bonus Received!',
            message: `You earned $${referralBonus.toFixed(2)} because ${username} signed up using your link!`,
          },
        });
      }

      return user;
    });

    const token = jwt.sign(
      { id: newUser.id, email: newUser.email, username: newUser.username, role: newUser.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'User registered successfully. Welcome bonus applied.',
      token,
      user: {
        id: newUser.id,
        email: newUser.email,
        username: newUser.username,
        role: newUser.role,
        referralCode: newUser.referralCode,
        isVerified: newUser.isVerified,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Registration failed' });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user || user.isBanned) {
      return res.status(401).json({ error: 'Invalid credentials or account is banned' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);

    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        referralCode: user.referralCode,
        isVerified: user.isVerified,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Login failed' });
  }
};

export const sendVerification = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.isVerified) {
      return res.status(400).json({ error: 'Email is already verified' });
    }

    // Generate a fresh verification token
    const verificationToken = Math.random().toString(36).substring(2, 15);

    await prisma.user.update({
      where: { id: user.id },
      data: { verificationToken },
    });

    // In production this would send an email. We return the token for mock/demo flow.
    res.json({
      message: 'Verification email sent (mock: token returned for testing)',
      verificationToken,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to send verification' });
  }
};

export const verifyEmail = async (req: Request, res: Response) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    const user = await prisma.user.findFirst({
      where: { verificationToken: token },
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid verification token' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        isVerified: true,
        verificationToken: null,
      },
    });

    res.json({ message: 'Email verified successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Verification failed' });
  }
};

export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // Return 200 for security reasons to hide if email exists
      return res.json({ message: 'If the email exists, a reset link has been sent' });
    }

    const resetToken = Math.random().toString(36).substring(2, 15);
    const resetTokenExp = new Date(Date.now() + 3600000); // 1 hour

    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken,
        resetTokenExp,
      },
    });

    // In a real application, you'd send an email here. We return the token for testing/demonstration.
    res.json({
      message: 'Password reset token generated successfully (demonstration only)',
      resetToken, // Returned so mock frontend can easily reset
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Forgot password failed' });
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }

    const user = await prisma.user.findFirst({
      where: {
        resetToken: token,
        resetTokenExp: { gt: new Date() },
      },
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        resetToken: null,
        resetTokenExp: null,
      },
    });

    res.json({ message: 'Password reset successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Password reset failed' });
  }
};

export const updateProfile = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { username, email, currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    // Fetch current user data
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updates: any = {};

    // --- Username change ---
    if (username && username !== currentUser.username) {
      const existing = await prisma.user.findUnique({
        where: { username },
      });
      if (existing) {
        return res.status(400).json({ error: 'Username is already taken' });
      }
      updates.username = username;
    }

    // --- Email change ---
    if (email && email !== currentUser.email) {
      const existing = await prisma.user.findUnique({
        where: { email },
      });
      if (existing) {
        return res.status(400).json({ error: 'Email is already in use' });
      }
      updates.email = email;
      updates.isVerified = false;
      updates.verificationToken = Math.random().toString(36).substring(2, 15);
    }

    // --- Password change ---
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ error: 'Current password is required to set a new password' });
      }

      const isMatch = await bcrypt.compare(currentPassword, currentUser.passwordHash);
      if (!isMatch) {
        return res.status(400).json({ error: 'Current password is incorrect' });
      }

      updates.passwordHash = await bcrypt.hash(newPassword, 10);
    }

    // If nothing to update
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No changes provided' });
    }

    // Apply updates
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updates,
    });

    // Generate a new token if email or username changed (JWT payload includes them)
    const newToken = jwt.sign(
      {
        id: updatedUser.id,
        email: updatedUser.email,
        username: updatedUser.username,
        role: updatedUser.role,
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Profile updated successfully',
      token: newToken,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        username: updatedUser.username,
        role: updatedUser.role,
        referralCode: updatedUser.referralCode,
        isVerified: updatedUser.isVerified,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to update profile' });
  }
};

export const getProfile = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        wallet: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        referralCode: user.referralCode,
        isVerified: user.isVerified,
        createdAt: user.createdAt,
        wallet: user.wallet,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to get profile' });
  }
};
