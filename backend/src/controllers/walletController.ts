import { Response } from 'express';
import prisma from '../db';
import { AuthRequest } from '../middlewares/auth';

export const getWalletInfo = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const wallet = await prisma.wallet.findUnique({
      where: { userId: req.user.id },
    });

    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    res.json({ wallet });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to get wallet info' });
  }
};

export const depositRequest = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const { amount, txHash } = req.body;

    if (!amount || amount <= 0 || !txHash) {
      return res.status(400).json({ error: 'Invalid amount or transaction hash' });
    }

    const request = await prisma.depositRequest.create({
      data: {
        userId: req.user.id,
        amount,
        txHash,
        status: 'PENDING',
      },
    });

    res.status(201).json({
      message: 'Deposit request submitted. Pending admin approval.',
      request,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Deposit submission failed' });
  }
};

export const withdrawRequest = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const { amount, address } = req.body;

    if (!amount || amount <= 0 || !address) {
      return res.status(400).json({ error: 'Invalid amount or wallet address' });
    }

    // Check balance
    const wallet = await prisma.wallet.findUnique({
      where: { userId: req.user.id },
    });

    if (!wallet || wallet.balance.toNumber() < amount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    // Run withdrawal submission inside transaction to ensure atomicity
    const request = await prisma.$transaction(async (tx) => {
      // Deduct balance immediately to prevent double spending
      await tx.wallet.update({
        where: { userId: req.user!.id },
        data: {
          balance: { decrement: amount },
        },
      });

      // Create the withdrawal request first so the ledger entry can be linked to it
      const withdraw = await tx.withdrawalRequest.create({
        data: {
          userId: req.user!.id,
          amount,
          address,
          status: 'PENDING',
        },
      });

      // Create transaction log (marked as PENDING), tied to the request
      await tx.transaction.create({
        data: {
          userId: req.user!.id,
          type: 'WITHDRAWAL',
          amount,
          status: 'PENDING',
          description: `Withdrawal request to address ${address}`,
          withdrawalRequestId: withdraw.id,
        },
      });

      return withdraw;
    });

    res.status(201).json({
      message: 'Withdrawal request submitted. Balance deducted. Pending admin approval.',
      request,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Withdrawal submission failed' });
  }
};

export const getTransactions = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const transactions = await prisma.transaction.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ transactions });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch transactions' });
  }
};

export const getDepositHistory = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const deposits = await prisma.depositRequest.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ deposits });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch deposit requests' });
  }
};

export const getWithdrawalHistory = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const withdrawals = await prisma.withdrawalRequest.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ withdrawals });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch withdrawal requests' });
  }
};
