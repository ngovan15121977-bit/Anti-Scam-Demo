export type PaymentQrData = {
  accountNumber: string;
  bankCode: string;
  bankName?: string;
  amount?: number;
  note?: string;
  accountName?: string;
};

type BankDefinition = {
  code: string;
  name: string;
};

export const paymentBanks: BankDefinition[] = [
  { code: "ABB", name: "ABBank" },
  { code: "ACB", name: "ACB" },
  { code: "AGRIBANK", name: "Agribank" },
  { code: "BAB", name: "Bac A Bank" },
  { code: "VPB", name: "VPBank" },
  { code: "BIDV", name: "BIDV" },
  { code: "BVB", name: "BaoViet Bank" },
  { code: "CAKE", name: "Cake by VPBank" },
  { code: "CIMB", name: "CIMB Vietnam" },
  { code: "CTG", name: "VietinBank" },
  { code: "EIB", name: "Eximbank" },
  { code: "GPB", name: "GPBank" },
  { code: "HDB", name: "HDBank" },
  { code: "HSBC", name: "HSBC Vietnam" },
  { code: "IVB", name: "Indovina Bank" },
  { code: "KBANK", name: "Kasikornbank" },
  { code: "KLB", name: "KienlongBank" },
  { code: "LPB", name: "LPBank" },
  { code: "MBB", name: "MB Bank" },
  { code: "MSB", name: "MSB" },
  { code: "NAB", name: "Nam A Bank" },
  { code: "OCB", name: "OCB" },
  { code: "PGB", name: "PGBank" },
  { code: "PVCB", name: "PVcomBank" },
  { code: "SCB", name: "SCB" },
  { code: "SCVN", name: "Standard Chartered Vietnam" },
  { code: "SEAB", name: "SeABank" },
  { code: "SGB", name: "Saigonbank" },
  { code: "SHB", name: "SHB" },
  { code: "SHINHAN", name: "Shinhan Bank" },
  { code: "STB", name: "Sacombank" },
  { code: "TCB", name: "Techcombank" },
  { code: "TIMO", name: "Timo" },
  { code: "TPB", name: "TPBank" },
  { code: "UBANK", name: "Ubank by VPBank" },
  { code: "UOB", name: "UOB Vietnam" },
  { code: "VAB", name: "Viet A Bank" },
  { code: "VCB", name: "Vietcombank" },
  { code: "VIB", name: "VIB" },
  { code: "WOORI", name: "Woori Bank Vietnam" },
];

const PREFIX = "TIMI--PAYMENT:1:";
const MAX_QR_LENGTH = 2048;

type EncodedPayment = {
  version: 1;
  accountNumber: string;
  bankCode: string;
  amount?: number;
  note?: string;
  accountName?: string;
};

function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function normalizePayment(input: PaymentQrData): EncodedPayment | null {
  const accountNumber = input.accountNumber.replace(/\s+/g, "");
  const bank = paymentBanks.find((item) => item.code === input.bankCode);
  const amount = input.amount;
  const note = input.note?.trim();
  const accountName = input.accountName?.trim();

  if (!bank || !/^\d{6,19}$/.test(accountNumber)) return null;
  if (amount !== undefined && (!Number.isSafeInteger(amount) || amount <= 0 || amount > 10_000_000_000)) return null;
  if (note && note.length > 500) return null;
  if (accountName && accountName.length > 255) return null;

  return {
    version: 1,
    accountNumber,
    bankCode: bank.code,
    ...(amount ? { amount } : {}),
    ...(note ? { note } : {}),
    ...(accountName ? { accountName } : {}),
  };
}

/** Creates a local, non-payment QR payload for the Timi  flow. */
export function createPaymentQr(input: PaymentQrData): string | null {
  const payment = normalizePayment(input);
  if (!payment) return null;
  const payload = `${PREFIX}${toBase64Url(JSON.stringify(payment))}`;
  return payload.length <= MAX_QR_LENGTH ? payload : null;
}

/** Rejects every QR type other than the documented Timi  payment payload. */
export function parsePaymentQr(rawValue: string): PaymentQrData | null {
  const raw = rawValue.trim();
  if (!raw.startsWith(PREFIX) || raw.length > MAX_QR_LENGTH) return null;

  const decoded = fromBase64Url(raw.slice(PREFIX.length));
  if (!decoded) return null;

  try {
    const value: unknown = JSON.parse(decoded);
    if (!value || typeof value !== "object") return null;
    const candidate = value as Partial<EncodedPayment>;
    if (candidate.version !== 1 || typeof candidate.accountNumber !== "string" || typeof candidate.bankCode !== "string") {
      return null;
    }

    const bank = paymentBanks.find((item) => item.code === candidate.bankCode);
    const amount = candidate.amount;
    const note = candidate.note;
    const accountName = candidate.accountName;
    if (!bank || !/^\d{6,19}$/.test(candidate.accountNumber)) return null;
    if (amount !== undefined && (!Number.isSafeInteger(amount) || amount <= 0 || amount > 10_000_000_000)) return null;
    if (note !== undefined && (typeof note !== "string" || note.length > 500)) return null;
    if (accountName !== undefined && (typeof accountName !== "string" || accountName.length > 255)) return null;

    return {
      accountNumber: candidate.accountNumber,
      bankCode: bank.code,
      bankName: bank.name,
      ...(amount ? { amount } : {}),
      ...(note ? { note } : {}),
      ...(accountName ? { accountName } : {}),
    };
  } catch {
    return null;
  }
}
