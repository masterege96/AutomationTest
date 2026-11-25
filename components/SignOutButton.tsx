"use client";

import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/client/supabase";
import styles from "./ui.module.css";

// Removes every Supabase session cookie (sb-*) from this origin. Used when the revoke call fails,
// so the user is still signed out locally (threat model 3.6).
function clearSessionCookies() {
  for (const part of document.cookie.split(";")) {
    const name = part.split("=")[0]?.trim();
    if (name && name.startsWith("sb-")) {
      document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
    }
  }
}

export default function SignOutButton() {
  const [pending, setPending] = useState(false);

  async function signOut() {
    if (pending) return;
    setPending(true);
    try {
      // Default scope "global": revokes all of the user's refresh tokens at the Auth server.
      const { error } = await getSupabaseBrowserClient().auth.signOut();
      if (error) clearSessionCookies();
    } catch {
      clearSessionCookies();
    }
    window.location.replace("/sign-in");
  }

  return (
    <button type="button" onClick={signOut} disabled={pending} className={styles.secondaryButton}>
      Sign out
    </button>
  );
}
