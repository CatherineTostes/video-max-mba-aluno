/**
 * One labelled input in an auth form, with its inline validation messages.
 *
 * Shared by the register and login forms so the two pages cannot drift apart
 * on spacing, focus ring, or — more importantly — on how errors are wired to
 * the input for screen readers.
 */

type AuthFieldProps = {
  id: string;
  label: string;
  type: "text" | "email" | "password";
  autoComplete: string;
  errors?: string[];
  hint?: string;
  /**
   * Restores what the user typed after a rejected submit. React resets an
   * uncontrolled form once its action settles, and `reset()` restores inputs
   * to their current `defaultValue` — so re-rendering with this set is what
   * survives the reset.
   */
  defaultValue?: string;
};

export function AuthField({
  id,
  label,
  type,
  autoComplete,
  errors,
  hint,
  defaultValue,
}: AuthFieldProps) {
  const hasErrors = errors !== undefined && errors.length > 0;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = hasErrors ? `${id}-error` : undefined;

  return (
    <div>
      <label
        htmlFor={id}
        className="block text-sm font-medium text-foreground"
      >
        {label}
      </label>

      <input
        id={id}
        name={id}
        type={type}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        required
        aria-invalid={hasErrors || undefined}
        aria-describedby={
          [errorId, hintId].filter(Boolean).join(" ") || undefined
        }
        className={`mt-2 block h-11 w-full rounded-md border bg-background px-3 text-base text-foreground transition-colors placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
          hasErrors ? "border-red-500" : "border-outline"
        }`}
      />

      {hint ? (
        <p id={hintId} className="mt-2 text-sm text-muted">
          {hint}
        </p>
      ) : null}

      {hasErrors ? (
        <ul id={errorId} className="mt-2 space-y-1 text-sm text-red-600">
          {errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
