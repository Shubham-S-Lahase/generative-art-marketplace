import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CreditCard, Smartphone, Lock, X, Loader2, ShieldCheck } from 'lucide-react';
import api from '../services/api';
import {
  TEST_CARDS,
  MOCK_OTP,
  createIdempotencyKey,
  formatCardNumber,
  simulateMockPayment,
  validateCardCheckout,
  validateUpiCheckout,
  type CheckoutFieldErrors,
} from '../utils/checkoutValidation';

const CHECKOUT_TTL_MS = 15 * 60 * 1000;

const TEST_CARD = '4111 1111 1111 1111';
const TEST_EXPIRY = '12/30';
const TEST_CVV = '123';

type CheckoutArtwork = {
  id: string;
  title?: string;
  files?: { preview?: string };
  previewUrl?: string;
  imageUrl?: string;
  marketplace?: { price?: number };
};

type MockCheckoutModalProps = {
  artwork: CheckoutArtwork;
  license: string;
  onClose: () => void;
  onSuccess: () => void;
};

const MockCheckoutModal = ({ artwork, license, onClose, onSuccess }: MockCheckoutModalProps) => {
  const openedAt = useRef(Date.now());
  const idempotencyKey = useRef(createIdempotencyKey());
  const payInFlight = useRef(false);

  const [method, setMethod] = useState<'card' | 'upi'>('card');
  const [step, setStep] = useState<'form' | '3ds' | 'processing'>('form');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<CheckoutFieldErrors>({});
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState('');

  const [cardNumber, setCardNumber] = useState(TEST_CARD);
  const [expiry, setExpiry] = useState(TEST_EXPIRY);
  const [cvv, setCvv] = useState(TEST_CVV);
  const [name, setName] = useState('Test User');
  const [upiId, setUpiId] = useState('success@razorpay');

  const initialPrice = artwork.marketplace?.price ?? 0;
  const [quotedPrice, setQuotedPrice] = useState(initialPrice);

  const preview =
    artwork.files?.preview || artwork.previewUrl || artwork.imageUrl;

  const sessionExpired = useMemo(
    () => Date.now() - openedAt.current > CHECKOUT_TTL_MS,
    [step, processing]
  );

  const requestClose = useCallback(() => {
    if (processing || payInFlight.current) return;
    if (step === '3ds' || cardNumber !== TEST_CARD || upiId !== 'success@razorpay') {
      if (!window.confirm('Discard this payment?')) return;
    }
    onClose();
  }, [processing, step, cardNumber, upiId, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [requestClose]);

  const completePurchase = async () => {
    if (payInFlight.current) return;
    payInFlight.current = true;
    setStep('processing');
    setProcessing(true);
    setError('');

    try {
      const quote = await api.getCheckoutQuote(artwork.id, license);
      const serverAmount = quote.amount ?? quote.price;
      if (!quote.forSale) {
        setError('This artwork is no longer for sale.');
        setStep('form');
        return;
      }
      if (serverAmount !== undefined && Math.abs(serverAmount - quotedPrice) > 0.01) {
        setQuotedPrice(serverAmount);
        setError('Price was updated. Review the amount and try again.');
        setStep('form');
        return;
      }

      await new Promise((r) => setTimeout(r, 900));
      await api.purchaseArtwork(artwork.id, license, idempotencyKey.current);
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string }; status?: number } };
      if (axiosErr.response?.status === 409) {
        onSuccess();
        onClose();
        return;
      }
      setError(axiosErr.response?.data?.error || 'Payment could not be completed.');
      setStep('form');
    } finally {
      setProcessing(false);
      payInFlight.current = false;
    }
  };

  const handlePay = async () => {
    setError('');
    setFieldErrors({});
    setOtpError('');

    if (sessionExpired) {
      setError('Checkout session expired. Close and start again.');
      return;
    }

    if (method === 'card') {
      const errs = validateCardCheckout(name, cardNumber, expiry, cvv);
      if (Object.keys(errs).length > 0) {
        setFieldErrors(errs);
        return;
      }
    } else {
      const errs = validateUpiCheckout(upiId);
      if (Object.keys(errs).length > 0) {
        setFieldErrors(errs);
        return;
      }
    }

    const sim = simulateMockPayment(method, cardNumber, upiId);
    if (!sim.ok) {
      setError(sim.message);
      return;
    }

    if (sim.requires3DS) {
      setStep('3ds');
      setOtp('');
      return;
    }

    await completePurchase();
  };

  const handle3dsConfirm = async () => {
    setOtpError('');
    if (otp.trim() !== MOCK_OTP) {
      setOtpError(`Enter test OTP: ${MOCK_OTP}`);
      return;
    }
    await completePurchase();
  };

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div
          className="fixed inset-0 bg-black/60"
          onClick={requestClose}
          aria-hidden
        />
        <div
          className="relative w-full max-w-md bg-white dark:bg-gray-800 rounded-xl shadow-2xl overflow-hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby="checkout-title"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 text-gray-900 dark:text-white font-semibold">
              <Lock className="h-4 w-4 text-indigo-600" />
              <span id="checkout-title">Secure checkout</span>
            </div>
            <button
              type="button"
              onClick={requestClose}
              disabled={processing}
              className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="px-5 py-3 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-100 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200 space-y-1">
            <p>Development mode — no real money is charged.</p>
            <p>
              Test: success <span className="font-mono">4111…1111</span> · decline{' '}
              <span className="font-mono">4000…0002</span> · 3DS <span className="font-mono">4000…3220</span>
              · UPI fail <span className="font-mono">fail@mock</span>
            </p>
          </div>

          {step === '3ds' ? (
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-2 text-gray-900 dark:text-white font-medium">
                <ShieldCheck className="h-5 w-5 text-indigo-600" />
                Verify payment (3D Secure)
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Enter the one-time password sent to your bank (mock).
              </p>
              <input
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6-digit OTP"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm font-mono tracking-widest"
                autoComplete="one-time-code"
              />
              {otpError && <p className="text-sm text-red-600">{otpError}</p>}
              <button
                type="button"
                onClick={handle3dsConfirm}
                disabled={processing}
                className="w-full py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-indigo-400"
              >
                {processing ? 'Confirming…' : 'Confirm payment'}
              </button>
              <button
                type="button"
                onClick={() => setStep('form')}
                disabled={processing}
                className="w-full text-sm text-gray-500 hover:text-gray-700"
              >
                Back
              </button>
            </div>
          ) : (
            <div className="p-5 space-y-4">
              <div className="flex gap-3">
                {preview && (
                  <img src={preview} alt="" className="w-16 h-16 rounded-lg object-cover" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 dark:text-white truncate">
                    {artwork.title || 'Artwork'}
                  </p>
                  <p className="text-sm text-gray-500 capitalize">{license} license</p>
                  <p className="text-lg font-bold text-indigo-600 dark:text-indigo-400 mt-1">
                    ${quotedPrice.toFixed(2)}
                  </p>
                </div>
              </div>

              {sessionExpired && (
                <p className="text-sm text-red-600">Session expired — close and reopen checkout.</p>
              )}

              <div className="flex rounded-lg border border-gray-200 dark:border-gray-600 p-1">
                <button
                  type="button"
                  onClick={() => setMethod('card')}
                  disabled={processing}
                  className={`flex-1 flex items-center justify-center gap-1 py-2 text-sm rounded-md ${
                    method === 'card'
                      ? 'bg-indigo-600 text-white'
                      : 'text-gray-600 dark:text-gray-300'
                  }`}
                >
                  <CreditCard className="h-4 w-4" /> Card
                </button>
                <button
                  type="button"
                  onClick={() => setMethod('upi')}
                  disabled={processing}
                  className={`flex-1 flex items-center justify-center gap-1 py-2 text-sm rounded-md ${
                    method === 'upi'
                      ? 'bg-indigo-600 text-white'
                      : 'text-gray-600 dark:text-gray-300'
                  }`}
                >
                  <Smartphone className="h-4 w-4" /> UPI
                </button>
              </div>

              {method === 'card' ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Name on card</label>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoComplete="cc-name"
                      disabled={processing}
                      className={`w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:text-white text-sm ${
                        fieldErrors.name
                          ? 'border-red-500'
                          : 'border-gray-300 dark:border-gray-600'
                      }`}
                    />
                    {fieldErrors.name && (
                      <p className="text-xs text-red-600 mt-1">{fieldErrors.name}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Card number</label>
                    <input
                      value={cardNumber}
                      onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                      autoComplete="cc-number"
                      inputMode="numeric"
                      disabled={processing}
                      className={`w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:text-white text-sm font-mono ${
                        fieldErrors.cardNumber
                          ? 'border-red-500'
                          : 'border-gray-300 dark:border-gray-600'
                      }`}
                    />
                    {fieldErrors.cardNumber && (
                      <p className="text-xs text-red-600 mt-1">{fieldErrors.cardNumber}</p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Expiry</label>
                      <input
                        value={expiry}
                        onChange={(e) => setExpiry(e.target.value)}
                        placeholder="MM/YY"
                        autoComplete="cc-exp"
                        disabled={processing}
                        className={`w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:text-white text-sm ${
                          fieldErrors.expiry
                            ? 'border-red-500'
                            : 'border-gray-300 dark:border-gray-600'
                        }`}
                      />
                      {fieldErrors.expiry && (
                        <p className="text-xs text-red-600 mt-1">{fieldErrors.expiry}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">CVV</label>
                      <input
                        value={cvv}
                        onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                        autoComplete="cc-csc"
                        type="password"
                        inputMode="numeric"
                        disabled={processing}
                        className={`w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:text-white text-sm ${
                          fieldErrors.cvv
                            ? 'border-red-500'
                            : 'border-gray-300 dark:border-gray-600'
                        }`}
                      />
                      {fieldErrors.cvv && (
                        <p className="text-xs text-red-600 mt-1">{fieldErrors.cvv}</p>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">UPI ID</label>
                  <input
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value)}
                    autoComplete="off"
                    disabled={processing}
                    className={`w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:text-white text-sm ${
                      fieldErrors.upiId
                        ? 'border-red-500'
                        : 'border-gray-300 dark:border-gray-600'
                    }`}
                  />
                  {fieldErrors.upiId && (
                    <p className="text-xs text-red-600 mt-1">{fieldErrors.upiId}</p>
                  )}
                </div>
              )}

              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

              <button
                type="button"
                onClick={handlePay}
                disabled={processing || sessionExpired}
                className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-medium rounded-lg"
              >
                {processing ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Processing…
                  </>
                ) : (
                  <>Pay ${quotedPrice.toFixed(2)}</>
                )}
              </button>

              <p className="text-center text-xs text-gray-400">
                Simulated payment · amount verified on server
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MockCheckoutModal;
