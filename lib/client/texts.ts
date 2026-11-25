// Exact screen texts from tasks/3/TASK_BRIEF.md acceptance criteria (change only by updating the brief first).
export const TEXT = {
  codeSent: "Check your email for a sign-in code.",
  invalidEmail: "Enter a valid email address.",
  wrongCode: "That code is wrong or has expired. Request a new code.",
  resendTooFast: "Please wait a minute before requesting another code.",
  noTodos: "No to-dos yet.",
  invalidTitle: "Title must be 1 to 200 characters.",
  todoGone: "This to-do no longer exists.",
  // Texts not fixed by an AC (listed in the frontend-dev Handoff).
  invalidCodeFormat: "Enter the 6-digit code from the email.",
  loading: "Loading to-dos…",
  genericError: "Something went wrong. Try again.",
} as const;
