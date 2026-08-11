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
  { code: "ACB", name: "ACB" },
  { code: "AGRIBANK", name: "Agribank" },
  { code: "BIDV", name: "BIDV" },
  { code: "CTG", name: "VietinBank" },
  { code: "HDB", name: "HDBank" },
  { code: "MBB", name: "MB Bank" },
  { code: "MSB", name: "MSB" },
  { code: "OCB", name: "OCB" },
  { code: "SHB", name: "SHB" },
  { code: "STB", name: "Sacombank" },
  { code: "TCB", name: "Techcombank" },
  { code: "TPB", name: "TPBank" },
  { code: "VCB", name: "Vietcombank" },
  { code: "VIB", name: "VIB" },
  { code: "VPB", name: "VPBank" },
];

const PREFIX = "TIMI-DEMO-PAYMENT:1:";
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

/** Creates a local, non-payment QR payload for the Timi demo flow. */
export function createDemoPaymentQr(input: PaymentQrData): string | null {
  const payment = normalizePayment(input);
  if (!payment) return null;
  const payload = `${PREFIX}${toBase64Url(JSON.stringify(payment))}`;
  return payload.length <= MAX_QR_LENGTH ? payload : null;
}

/** Rejects every QR type other than the documented Timi demo payment payload. */
export function parseDemoPaymentQr(rawValue: string): PaymentQrData | null {
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
