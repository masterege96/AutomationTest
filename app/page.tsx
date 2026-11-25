import type { Metadata } from "next";
import { redirect } from "next/navigation";
import SignOutButton from "@/components/SignOutButton";
import TodoList from "@/components/TodoList";
import { createClient, getVerifiedUser } from "@/lib/server/supabase";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "My to-dos",
};

// To-do list page. The server asks the Auth server (getVerifiedUser -> getUser) before rendering anything user-specific;
// no session means the sign-in screen (threat model 3.3, 3.4; AC9). The proxy is not the check.
export default async function TodoPage() {
  const supabase = await createClient();
  const user = await getVerifiedUser(supabase);
  if (!user) redirect("/sign-in");

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <header className={styles.header}>
          <div>
            <h1>My to-dos</h1>
            <p>
              Signed in as <span className={styles.email}>{user.email}</span>
            </p>
          </div>
          <SignOutButton />
        </header>
        <TodoList />
      </main>
    </div>
  );
}
