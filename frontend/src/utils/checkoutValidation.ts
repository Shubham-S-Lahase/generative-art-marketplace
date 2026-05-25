/** Mock gateway rules — mirrors common Stripe/Razorpay test behaviors */

export const TEST_CARDS = {
  success: '4111111111111111',
  decline: '4000000000000002',
  threeDS: '4000000000003220',
} as const;

export const MOCK_OTP = '123456';

export type CheckoutFieldErrors = {
  name?: string;
  cardNumber?: string;
  expiry?: string;
  cvv?: string;
  upiId?: string;
};

export type MockPaymentResult =
  | { ok: true; requires3DS?: boolean }
  | { ok: false; code: string; message: string };

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

export function formatCardNumber(value: string): string {
  const d = digitsOnly(value).slice(0, 19);
  return d.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}

export function luhnCheck(cardNumber: string): boolean {
  const digits = digitsOnly(cardNumber);
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export function parseExpiry(expiry: string): { month: number; year: number } | null {
  const m = expiry.trim().match(/^(\d{1,2})\s*\/\s*(\d{2,4})$/);
  if (!m) return null;
  const month = parseInt(m[1], 10);
  let year = parseInt(m[2], 10);
  if (year < 100) year += 2000;
  if (month < 1 || month > 12) return null;
  return { month, year };
}

export function isExpiryValid(expiry: string): boolean {
  const parsed = parseExpiry(expiry);
  if (!parsed) return false;
  const now = new Date();
  const expEnd = new Date(parsed.year, parsed.month, 0, 23, 59, 59);
  return expEnd >= now;
}

export function validateCardCheckout(
  name: string,
  cardNumber: string,
  expiry: string,
  cvv: string
): CheckoutFieldErrors {
  const errors: CheckoutFieldErrors = {};
  if (!name.trim() || name.trim().length < 2) {
    errors.name = 'Enter the name on card';
  }
  const digits = digitsOnly(cardNumber);
  if (digits.length < 13) {
    errors.cardNumber = 'Enter a valid card number';
  } else if (!luhnCheck(cardNumber)) {
    errors.cardNumber = 'Card number failed validation';
  }
  if (!isExpiryValid(expiry)) {
    errors.expiry = 'Enter a valid future expiry (MM/YY)';
  }
  if (!/^\d{3,4}$/.test(cvv.trim())) {
    errors.cvv = 'Enter a valid CVV';
  }
  return errors;
}

export function validateUpiCheckout(upiId: string): CheckoutFieldErrors {
  const errors: CheckoutFieldErrors = {};
  const id = upiId.trim().toLowerCase();
  if (!id) {
    errors.upiId = 'Enter a UPI ID';
  } else if (!/^[a-z0-9._-]{2,}@[a-z][a-z0-9.-]{2,}$/i.test(id)) {
    errors.upiId = 'Enter a valid UPI ID (e.g. name@bank)';
  }
  return errors;
}

export function simulateMockPayment(
  method: 'card' | 'upi',
  cardNumber: string,
  upiId: string
): MockPaymentResult {
  if (method === 'upi') {
    const id = upiId.trim().toLowerCase();
    if (id === 'fail@mock' || id === 'decline@mock') {
      return {
        ok: false,
        code: 'payment_declined',
        message: 'UPI payment was declined by the bank. Try another method.',
      };
    }
    return { ok: true };
  }

  const digits = digitsOnly(cardNumber);
  if (digits === TEST_CARDS.decline) {
    return {
      ok: false,
      code: 'card_declined',
      message: 'Your card was declined. Use test card 4111…1111 for success.',
    };
  }
  if (digits === TEST_CARDS.threeDS) {
    return { ok: true, requires3DS: true };
  }
  if (digits === TEST_CARDS.success || luhnCheck(cardNumber)) {
    return { ok: true };
  }
  return {
    ok: false,
    code: 'invalid_card',
    message: 'Card could not be processed.',
  };
}

export function createIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `idem_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}
