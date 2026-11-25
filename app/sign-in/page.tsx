import type { Metadata } from "next";
import { redirect } from "next/navigation";
import SignInForm from "@/components/SignInForm";
import { createClient } from "@/lib/server/supabase";
import styles from "../page.module.css";

export const metadata: Metadata = {
  title: "Sign in",
};

// Public sign-in page. A signed-in user goes to the list (UX only; threat model 3.4).
// No return-path parameter: after sign-in the user always lands on "/" (threat model 3.1).
export default async function SignInPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/");

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <h1>Sign in</h1>
        <p>Enter your email address and we will send you a 6-digit sign-in code.</p>
        <SignInForm />
      </main>
    </div>
  );
}
