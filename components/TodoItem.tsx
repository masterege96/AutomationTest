"use client";

import { useRef, useState, type FormEvent } from "react";
import type { Todo } from "@/lib/client/api";
import { TEXT } from "@/lib/client/texts";
import { normalizeTitle } from "@/lib/client/validation";
import styles from "./ui.module.css";

type Props = {
  todo: Todo;
  onToggle: (id: string, done: boolean) => Promise<string>;
  onRename: (id: string, title: string) => Promise<string>;
  onDelete: (id: string) => Promise<string>;
};

// Titles are rendered only as React text children and input values (row 11, AC34): never as HTML.
export default function TodoItem({ todo, onToggle, onRename, onDelete }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(todo.title);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const pendingRef = useRef(false);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  const checkboxId = `todo-${todo.id}`;
  const errorId = `todo-${todo.id}-error`;
  const editId = `todo-${todo.id}-edit`;

  // One request at a time per to-do: controls are disabled while it is pending, and the UI then shows
  // the state the server returned (AC43).
  async function run(action: () => Promise<string>): Promise<boolean> {
    if (pendingRef.current) return false;
    pendingRef.current = true;
    setPending(true);
    setError("");
    const message = await action();
    pendingRef.current = false;
    setPending(false);
    setError(message);
    return message === "";
  }

  function startEdit() {
    setDraft(todo.title);
    setError("");
    setEditing(true);
    requestAnimationFrame(() => editInputRef.current?.focus());
  }

  function cancelEdit() {
    setEditing(false);
    setError("");
    requestAnimationFrame(() => editButtonRef.current?.focus());
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = normalizeTitle(draft);
    if (title === null) {
      setError(TEXT.invalidTitle); // keeps the input (AC17)
      editInputRef.current?.focus();
      return;
    }
    const ok = await run(() => onRename(todo.id, title));
    if (ok) {
      setEditing(false);
      requestAnimationFrame(() => editButtonRef.current?.focus());
    } else {
      editInputRef.current?.focus();
    }
  }

  return (
    <li className={styles.item}>
      {editing ? (
        <form onSubmit={save} noValidate className={styles.row}>
          <label htmlFor={editId} className={styles.visuallyHidden}>
            Edit title
          </label>
          <input
            ref={editInputRef}
            id={editId}
            name="title"
            type="text"
            autoComplete="off"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") cancelEdit();
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={errorId}
            className={styles.input}
          />
          <button type="submit" disabled={pending} className={styles.primaryButton}>
            Save
          </button>
          <button type="button" onClick={cancelEdit} disabled={pending} className={styles.secondaryButton}>
            Cancel
          </button>
        </form>
      ) : (
        <div className={styles.row}>
          <input
            id={checkboxId}
            type="checkbox"
            checked={todo.done}
            disabled={pending}
            onChange={(e) => {
              const done = e.target.checked;
              void run(() => onToggle(todo.id, done));
            }}
            aria-describedby={errorId}
            className={styles.checkbox}
          />
          <label htmlFor={checkboxId} className={todo.done ? `${styles.title} ${styles.done}` : styles.title}>
            {todo.title}
          </label>
          <button
            ref={editButtonRef}
            type="button"
            onClick={startEdit}
            disabled={pending}
            aria-label={`Edit "${todo.title}"`}
            className={styles.secondaryButton}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => void run(() => onDelete(todo.id))}
            disabled={pending}
            aria-label={`Delete "${todo.title}"`}
            className={styles.dangerButton}
          >
            Delete
          </button>
        </div>
      )}
      <p id={errorId} role="alert" className={styles.error}>
        {error}
      </p>
    </li>
  );
}
