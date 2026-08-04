import { Prisma } from '@prisma/client';
import { Response } from 'express';
import prisma from '../db';
import { approveWithdrawal, rejectWithdrawal } from '../controllers/adminController';

// Mock the prisma client so these tests run without a database.
jest.mock('../db', () => ({
  __esModule: true,
  default: {
    withdrawalRequest: { findUnique: jest.fn(), update: jest.fn() },
    transaction: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    wallet: { update: jest.fn() },
    notification: { create: jest.fn() },
    adminActivityLog: { create: jest.fn() },
    $transaction: jest.fn(),
  },
}));

const mockDb = prisma as unknown as {
  withdrawalRequest: { findUnique: jest.Mock; update: jest.Mock };
  transaction: { findUnique: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
  wallet: { update: jest.Mock };
  notification: { create: jest.Mock };
  adminActivityLog: { create: jest.Mock };
  $transaction: jest.Mock;
};

// A pending withdrawal request with $5 to 0xABC123
const pendingRequest = {
  id: 'req-1',
  userId: 'user-1',
  amount: new Prisma.Decimal('5'),
  address: '0xABC123',
  status: 'PENDING',
};

const linkedTransaction = {
  id: 'tx-1',
  description: 'Withdrawal request to address 0xABC123',
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
  // Run the transaction callback with the mocked client so tx.* calls are captured.
  mockDb.$transaction.mockImplementation((cb: (tx: unknown) => unknown) => cb(prisma));
});

describe('approveWithdrawal', () => {
  it('returns 400 when requestId is missing', async () => {
    const res = makeRes();
    await approveWithdrawal(makeReq({}) as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Request ID is required' });
    expect(mockDb.withdrawalRequest.findUnique).not.toHaveBeenCalled();
  });

  it('returns 400 when the request is not found or not PENDING', async () => {
    mockDb.withdrawalRequest.findUnique.mockResolvedValue(null);
    const res = makeRes();
    await approveWithdrawal(makeReq({ requestId: 'req-1' }) as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Request not found or not in PENDING state',
    });
  });

  it('completes the request and the FK-linked transaction without creating duplicates', async () => {
    mockDb.withdrawalRequest.findUnique.mockResolvedValue(pendingRequest);
    mockDb.transaction.findUnique.mockResolvedValue(linkedTransaction);

    const res = makeRes();
    await approveWithdrawal(makeReq({ requestId: 'req-1' }) as any, res);

    // Ledger entry is looked up by the request FK, not by amount/address heuristics
    expect(mockDb.transaction.findUnique).toHaveBeenCalledWith({
      where: { withdrawalRequestId: 'req-1' },
    });

    expect(mockDb.withdrawalRequest.update).toHaveBeenCalledWith({
      where: { id: 'req-1' },
      data: { status: 'COMPLETED', approvedAt: expect.any(Date) },
    });
    expect(mockDb.transaction.update).toHaveBeenCalledWith({
      where: { id: 'tx-1' },
      data: { status: 'COMPLETED', withdrawalRequestId: 'req-1' },
    });
    expect(mockDb.transaction.create).not.toHaveBeenCalled();

    expect(mockDb.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'user-1', title: 'Withdrawal Approved' }),
    });
    expect(mockDb.adminActivityLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ adminId: 'admin-1' }),
    });
    expect(res.json).toHaveBeenCalledWith({ message: 'Withdrawal approved successfully' });
  });

  it('falls back to the legacy address/amount lookup for unlinked transactions', async () => {
    mockDb.withdrawalRequest.findUnique.mockResolvedValue(pendingRequest);
    mockDb.transaction.findUnique.mockResolvedValue(null);
    mockDb.transaction.findFirst.mockResolvedValue({ id: 'tx-old', description: linkedTransaction.description });

    const res = makeRes();
    await approveWithdrawal(makeReq({ requestId: 'req-1' }) as any, res);

    expect(mockDb.transaction.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
          type: 'WITHDRAWAL',
          amount: 5,
          status: 'PENDING',
          description: { contains: '0xABC123' },
        }),
      })
    );
    // Legacy entry is permanently linked to the request
    expect(mockDb.transaction.update).toHaveBeenCalledWith({
      where: { id: 'tx-old' },
      data: { status: 'COMPLETED', withdrawalRequestId: 'req-1' },
    });
    expect(res.json).toHaveBeenCalledWith({ message: 'Withdrawal approved successfully' });
  });

  it('creates a COMPLETED ledger entry linked to the request when none exists', async () => {
    mockDb.withdrawalRequest.findUnique.mockResolvedValue(pendingRequest);
    mockDb.transaction.findUnique.mockResolvedValue(null);
    mockDb.transaction.findFirst.mockResolvedValue(null);

    const res = makeRes();
    await approveWithdrawal(makeReq({ requestId: 'req-1' }) as any, res);

    expect(mockDb.transaction.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        type: 'WITHDRAWAL',
        amount: 5,
        status: 'COMPLETED',
        description: 'Approved withdrawal to 0xABC123',
        withdrawalRequestId: 'req-1',
      },
    });
    expect(res.json).toHaveBeenCalledWith({ message: 'Withdrawal approved successfully' });
  });
});

describe('rejectWithdrawal', () => {
  it('returns 400 when requestId is missing', async () => {
    const res = makeRes();
    await rejectWithdrawal(makeReq({}) as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Request ID is required' });
  });

  it('returns 400 when the request is not found or not PENDING', async () => {
    mockDb.withdrawalRequest.findUnique.mockResolvedValue(null);
    const res = makeRes();
    await rejectWithdrawal(makeReq({ requestId: 'req-1' }) as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Request not found or not in PENDING state',
    });
  });

  it('rejects the request, refunds the wallet, and marks the linked transaction REJECTED', async () => {
    mockDb.withdrawalRequest.findUnique.mockResolvedValue(pendingRequest);
    mockDb.transaction.findUnique.mockResolvedValue(linkedTransaction);

    const res = makeRes();
    await rejectWithdrawal(makeReq({ requestId: 'req-1' }) as any, res);

    expect(mockDb.transaction.findUnique).toHaveBeenCalledWith({
      where: { withdrawalRequestId: 'req-1' },
    });

    expect(mockDb.withdrawalRequest.update).toHaveBeenCalledWith({
      where: { id: 'req-1' },
      data: { status: 'REJECTED' },
    });
    expect(mockDb.wallet.update).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: { balance: { increment: expect.any(Prisma.Decimal) } },
    });
    expect(mockDb.transaction.update).toHaveBeenCalledWith({
      where: { id: 'tx-1' },
      data: {
        status: 'REJECTED',
        description: 'Withdrawal request to address 0xABC123 (Rejected by Admin - Refunded)',
        withdrawalRequestId: 'req-1',
      },
    });
    expect(mockDb.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'user-1', title: 'Withdrawal Rejected' }),
    });
    expect(res.json).toHaveBeenCalledWith({
      message: 'Withdrawal request rejected. Funds returned to user.',
    });
  });

  it('falls back to the legacy lookup when the transaction is not linked', async () => {
    mockDb.withdrawalRequest.findUnique.mockResolvedValue(pendingRequest);
    mockDb.transaction.findUnique.mockResolvedValue(null);
    mockDb.transaction.findFirst.mockResolvedValue(linkedTransaction);

    const res = makeRes();
    await rejectWithdrawal(makeReq({ requestId: 'req-1' }) as any, res);

    expect(mockDb.transaction.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ description: { contains: '0xABC123' } }),
      })
    );
    expect(mockDb.transaction.update).toHaveBeenCalledWith({
      where: { id: 'tx-1' },
      data: {
        status: 'REJECTED',
        description: 'Withdrawal request to address 0xABC123 (Rejected by Admin - Refunded)',
        withdrawalRequestId: 'req-1',
      },
    });
    expect(res.json).toHaveBeenCalledWith({
      message: 'Withdrawal request rejected. Funds returned to user.',
    });
  });
});
