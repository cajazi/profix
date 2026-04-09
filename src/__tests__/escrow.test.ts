import { describe, it, expect } from "vitest";

const PLATFORM_FEE_RATE = 0.025;

function calculatePlatformFee(amount: number): number {
  return Math.round(amount * PLATFORM_FEE_RATE * 100) / 100;
}

function calculateNetAmount(amount: number): number {
  return Math.round((amount - calculatePlatformFee(amount)) * 100) / 100;
}

function validateMilestonesSum(
  milestones: { amount: number }[],
  totalPrice: number
): boolean {
  const sum = milestones.reduce((s, m) => s + m.amount, 0);
  return Math.abs(sum - totalPrice) <= 0.01;
}

interface EscrowWallet {
  balance: number;
  locked_balance: number;
  released_total: number;
  refunded_total: number;
}

function applyDeposit(wallet: EscrowWallet, amount: number): EscrowWallet {
  return { ...wallet, balance: wallet.balance + amount };
}

function applyRelease(wallet: EscrowWallet, amount: number): EscrowWallet {
  if (wallet.balance < amount) throw new Error("Insufficient escrow balance");
  return {
    ...wallet,
    balance: wallet.balance - amount,
    released_total: wallet.released_total + amount,
  };
}

function applyRefund(wallet: EscrowWallet, amount: number): EscrowWallet {
  if (wallet.balance < amount) throw new Error("Insufficient escrow balance for refund");
  return {
    ...wallet,
    balance: wallet.balance - amount,
    refunded_total: wallet.refunded_total + amount,
  };
}

function canMakePayment(user: {
  email_verified: boolean;
  kyc_level: number;
  is_banned: boolean;
}): { allowed: boolean; reason?: string } {
  if (user.is_banned) return { allowed: false, reason: "Account is suspended" };
  if (!user.email_verified) return { allowed: false, reason: "Email verification required" };
  return { allowed: true };
}

type ContractStatus = "draft" | "active" | "completed" | "cancelled" | "disputed";

const VALID_TRANSITIONS: Record<ContractStatus, ContractStatus[]> = {
  draft:     ["active", "cancelled"],
  active:    ["completed", "cancelled", "disputed"],
  completed: [],
  cancelled: [],
  disputed:  ["active", "cancelled"],
};

function canTransition(from: ContractStatus, to: ContractStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// ─── Tests ────────────────────────────────────────────────────

describe("Platform Fee Calculations", () => {
  it("calculates 2.5% platform fee correctly", () => {
    expect(calculatePlatformFee(100_000)).toBe(2_500);
    expect(calculatePlatformFee(50_000)).toBe(1_250);
    expect(calculatePlatformFee(10_000)).toBe(250);
  });

  it("calculates net amount after platform fee", () => {
    expect(calculateNetAmount(100_000)).toBe(97_500);
    expect(calculateNetAmount(50_000)).toBe(48_750);
  });

  it("returns 0 fee for 0 amount", () => {
    expect(calculatePlatformFee(0)).toBe(0);
  });
});

describe("Milestone Validation", () => {
  it("validates milestones sum equals total price", () => {
    const milestones = [
      { amount: 30_000 },
      { amount: 50_000 },
      { amount: 20_000 },
    ];
    expect(validateMilestonesSum(milestones, 100_000)).toBe(true);
  });

  it("rejects milestones that do not sum to total", () => {
    const milestones = [{ amount: 30_000 }, { amount: 50_000 }];
    expect(validateMilestonesSum(milestones, 100_000)).toBe(false);
  });

  it("rejects empty milestones", () => {
    expect(validateMilestonesSum([], 100_000)).toBe(false);
  });
});

describe("Escrow Wallet Operations", () => {
  const emptyWallet: EscrowWallet = {
    balance: 0,
    locked_balance: 0,
    released_total: 0,
    refunded_total: 0,
  };

  it("deposit increases balance", () => {
    const w = applyDeposit(emptyWallet, 50_000);
    expect(w.balance).toBe(50_000);
  });

  it("release decreases balance and increases released_total", () => {
    const funded = applyDeposit(emptyWallet, 50_000);
    const released = applyRelease(funded, 20_000);
    expect(released.balance).toBe(30_000);
    expect(released.released_total).toBe(20_000);
  });

  it("throws on release with insufficient balance", () => {
    expect(() => applyRelease(emptyWallet, 10_000)).toThrow(
      "Insufficient escrow balance"
    );
  });

  it("refund decreases balance and increases refunded_total", () => {
    const funded = applyDeposit(emptyWallet, 50_000);
    const refunded = applyRefund(funded, 50_000);
    expect(refunded.balance).toBe(0);
    expect(refunded.refunded_total).toBe(50_000);
  });

  it("prevents double release", () => {
    const funded = applyDeposit(emptyWallet, 30_000);
    const released = applyRelease(funded, 30_000);
    expect(() => applyRelease(released, 30_000)).toThrow(
      "Insufficient escrow balance"
    );
  });
});

describe("KYC Payment Gate", () => {
  it("allows payment for verified user", () => {
    const result = canMakePayment({
      email_verified: true,
      kyc_level: 1,
      is_banned: false,
    });
    expect(result.allowed).toBe(true);
  });

  it("blocks banned user", () => {
    const result = canMakePayment({
      email_verified: true,
      kyc_level: 2,
      is_banned: true,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/suspended/i);
  });

  it("blocks unverified email", () => {
    const result = canMakePayment({
      email_verified: false,
      kyc_level: 0,
      is_banned: false,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/email/i);
  });
});

describe("Contract State Machine", () => {
  it("allows draft to active", () => expect(canTransition("draft", "active")).toBe(true));
  it("allows active to completed", () => expect(canTransition("active", "completed")).toBe(true));
  it("allows active to disputed", () => expect(canTransition("active", "disputed")).toBe(true));
  it("blocks completed to active", () => expect(canTransition("completed", "active")).toBe(false));
  it("blocks cancelled to active", () => expect(canTransition("cancelled", "active")).toBe(false));
  it("blocks draft to completed", () => expect(canTransition("draft", "completed")).toBe(false));
});