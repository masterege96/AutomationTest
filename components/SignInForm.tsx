"use client";

import { useRef, useState, type FormEvent } from "react";
import { getSupabaseBrowserClient } from "@/lib/client/supabase";
import { TEXT } from "@/lib/client/texts";
import { useHydrated } from "@/lib/client/use-hydrated";
import { isValidCode, isValidEmail, MAX_EMAIL_LENGTH } from "@/lib/client/validation";
import styles from "./ui.module.css";

type Step = "email" | "code";

function isRateLimited(error: { status?: number; code?: string }): boolean {
  return error.status === 429 || error.code === "over_email_send_rate_limit";
}

export default function SignInForm() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const hydrated = useHydrated();
  const busy = pending || !hydrated;
  const pendingRef = useRef(false);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingRef.current) return;
    setError("");
    setStatus("");
    // AC3: invalid email never reaches the auth service.
    if (!isValidEmail(email)) {
      setError(TEXT.invalidEmail);
      emailInputRef.current?.focus();
      return;
    }
    pendingRef.current = true;
    setPending(true);
    try {
      const { error: otpError } = await getSupabaseBrowserClient().auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: true },
      });
      if (otpError && isRateLimited(otpError)) {
        setError(TEXT.resendTooFast);
        return;
      }
      // AC6: every other result shows the same text (no account enumeration; threat model 3.1).
      setStatus(TEXT.codeSent);
      setStep("code");
      setCode("");
      requestAnimationFrame(() => codeInputRef.current?.focus());
    } catch {
      setStatus(TEXT.codeSent);
      setStep("code");
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingRef.current) return;
    setError("");
    if (!isValidCode(code)) {
      setError(TEXT.invalidCodeFormat);
      codeInputRef.current?.focus();
      return;
    }
    pendingRef.current = true;
    setPending(true);
    let signedIn = false;
    try {
      const { data, error: verifyError } = await getSupabaseBrowserClient().auth.verifyOtp({
        email: email.trim(),
        token: code.trim(),
        type: "email",
      });
      signedIn = !verifyError && Boolean(data.session);
    } catch {
      signedIn = false;
    }
    if (signedIn) {
      // Full navigation so the server renders the list with the new session cookie.
      window.location.replace("/");
      return;
    }
    setError(TEXT.wrongCode);
    pendingRef.current = false;
    setPending(false);
    codeInputRef.current?.focus();
  }

  function useDifferentEmail() {
    setStep("email");
    setCode("");
    setStatus("");
    setError("");
    requestAnimationFrame(() => emailInputRef.current?.focus());
  }

  return (
    <div className={styles.card}>
      <p role="status" aria-live="polite" className={styles.status}>
        {status}
      </p>
      {step === "email" ? (
        <form onSubmit={requestCode} method="post" noValidate className={styles.form}>
          <label htmlFor="email" className={styles.label}>
            Email address
          </label>
          <input
            ref={emailInputRef}
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            maxLength={MAX_EMAIL_LENGTH + 1}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "sign-in-error" : undefined}
            className={styles.input}
            autoFocus
          />
          <button type="submit" disabled={busy} className={styles.primaryButton}>
            Send code
          </button>
        </form>
      ) : (
        <form onSubmit={verifyCode} method="post" noValidate className={styles.form}>
          <p className={styles.hint}>
            Code sent to <strong>{email.trim()}</strong>
          </p>
          <label htmlFor="code" className={styles.label}>
            Sign-in code
          </label>
          <input
            ref={codeInputRef}
            id="code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "sign-in-error" : undefined}
            className={styles.input}
          />
          <button type="submit" disabled={busy} className={styles.primaryButton}>
            Sign in
          </button>
          <button type="button" onClick={useDifferentEmail} disabled={busy} className={styles.linkButton}>
            Use a different email
          </button>
        </form>
      )}
      <p id="sign-in-error" role="alert" className={styles.error}>
        {error}
      </p>
    </div>
  );
}
