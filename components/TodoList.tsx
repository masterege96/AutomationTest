"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError, createTodo, deleteTodo, listTodos, updateTodo, type Todo } from "@/lib/client/api";
import { TEXT } from "@/lib/client/texts";
import { useHydrated } from "@/lib/client/use-hydrated";
import { normalizeTitle } from "@/lib/client/validation";
import TodoItem from "./TodoItem";
import styles from "./ui.module.css";

type LoadState = "loading" | "ready" | "error";

function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 404) return TEXT.todoGone;
    if (error.code === "validation_failed") return TEXT.invalidTitle;
    return error.message;
  }
  return TEXT.genericError;
}

// Session ended (401): show the sign-in screen.
function redirectIfUnauthorized(error: unknown): boolean {
  if (error instanceof ApiError && error.status === 401) {
    window.location.replace("/sign-in");
    return true;
  }
  return false;
}

export default function TodoList() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [newTitle, setNewTitle] = useState("");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState("");
  const hydrated = useHydrated();
  const creatingRef = useRef(false);
  const newTitleRef = useRef<HTMLInputElement>(null);

  // Fetches the list from the API (responses are no-store; nothing is cached).
  const load = useCallback(() => {
    let cancelled = false;
    listTodos().then(
      (items) => {
        if (cancelled) return;
        setTodos(items);
        setLoadState("ready");
      },
      (error: unknown) => {
        if (cancelled || redirectIfUnauthorized(error)) return;
        setNotice(error instanceof ApiError && error.status !== 404 ? error.message : TEXT.genericError);
        setLoadState("error");
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => load(), [load]);

  // Back/forward cache: re-check the session when the page is restored (threat model 3.6).
  useEffect(() => {
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) window.location.reload();
    }
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  function retry() {
    setLoadState("loading");
    setNotice("");
    load();
  }

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creatingRef.current) return; // AC42: one request per submit, even on a double click / Enter.
    setCreateError("");
    setNotice("");
    const title = normalizeTitle(newTitle);
    if (title === null) {
      setCreateError(TEXT.invalidTitle);
      newTitleRef.current?.focus();
      return;
    }
    creatingRef.current = true;
    setCreating(true);
    try {
      const todo = await createTodo(title);
      setTodos((current) => [todo, ...current.filter((t) => t.id !== todo.id)]);
      setNewTitle("");
      setLoadState("ready");
    } catch (error) {
      if (redirectIfUnauthorized(error)) return;
      setCreateError(messageFor(error)); // keeps the input (AC17)
    } finally {
      creatingRef.current = false;
      setCreating(false);
      newTitleRef.current?.focus();
    }
  }

  // Runs a change for one to-do. Returns the error message to show next to the item, or "" on success.
  const runChange = useCallback(async (id: string, change: () => Promise<Todo | void>): Promise<string> => {
    setNotice("");
    try {
      const result = await change();
      if (result) setTodos((current) => current.map((t) => (t.id === result.id ? result : t)));
      else setTodos((current) => current.filter((t) => t.id !== id));
      return "";
    } catch (error) {
      if (redirectIfUnauthorized(error)) return "";
      if (error instanceof ApiError && error.status === 404) {
        // AC44: the to-do was deleted elsewhere.
        setTodos((current) => current.filter((t) => t.id !== id));
        setNotice(TEXT.todoGone);
        newTitleRef.current?.focus();
        return "";
      }
      return messageFor(error);
    }
  }, []);

  const onToggle = useCallback(
    (id: string, done: boolean) => runChange(id, () => updateTodo(id, { done })),
    [runChange],
  );
  const onRename = useCallback(
    (id: string, title: string) => runChange(id, () => updateTodo(id, { title })),
    [runChange],
  );
  const onDelete = useCallback((id: string) => runChange(id, () => deleteTodo(id)), [runChange]);

  return (
    <section aria-labelledby="todos-heading" className={styles.card}>
      <h2 id="todos-heading" className={styles.visuallyHidden}>
        To-dos
      </h2>
      <form onSubmit={onCreate} method="post" noValidate className={styles.form}>
        <label htmlFor="new-todo" className={styles.label}>
          New to-do
        </label>
        <div className={styles.row}>
          <input
            ref={newTitleRef}
            id="new-todo"
            name="title"
            type="text"
            autoComplete="off"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            aria-invalid={createError ? true : undefined}
            aria-describedby="new-todo-error"
            className={styles.input}
          />
          <button type="submit" disabled={creating || !hydrated} className={styles.primaryButton}>
            Add
          </button>
        </div>
        <p id="new-todo-error" role="alert" className={styles.error}>
          {createError}
        </p>
      </form>

      <p role="status" aria-live="polite" className={styles.status}>
        {notice}
      </p>

      {loadState === "loading" ? (
        <p className={styles.hint}>{TEXT.loading}</p>
      ) : loadState === "error" && todos.length === 0 ? (
        <button type="button" onClick={retry} className={styles.secondaryButton}>
          Try again
        </button>
      ) : todos.length === 0 ? (
        <p className={styles.hint}>{TEXT.noTodos}</p>
      ) : (
        <ul aria-label="To-dos" className={styles.list}>
          {todos.map((todo) => (
            <TodoItem key={todo.id} todo={todo} onToggle={onToggle} onRename={onRename} onDelete={onDelete} />
          ))}
        </ul>
      )}
    </section>
  );
}
