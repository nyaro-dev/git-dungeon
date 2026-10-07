"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { tryParseRepo } from "@/lib/ingest/repo-name";

/** Saisie d'un dépôt : valide côté client, puis ouvre la partie. */
export function RepoForm() {
  const router = useRouter();
  const inputId = useId();
  const errorId = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ref = tryParseRepo(value);
    if (!ref) {
      setError("Format attendu : owner/repo, ou l'URL GitHub du dépôt.");
      return;
    }
    setError(null);
    setPending(true);
    router.push(`/d/${ref.owner}/${ref.repo}`);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="noise-panel relative flex w-full flex-col gap-3 p-4 sm:p-5">
      <label htmlFor={inputId} className="text-xs tracking-[0.2em] text-muted uppercase">
        Dépôt GitHub public
      </label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          id={inputId}
          name="repo"
          type="text"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="vercel/next.js"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={error !== null}
          aria-describedby={error ? errorId : undefined}
          className="min-w-0 flex-1 rounded-full border border-border bg-black/40 px-5 py-3 font-mono text-base text-foreground placeholder:text-subtle focus:border-lime focus:outline-none"
        />
        <button type="submit" disabled={pending} className="pi-btn pi-btn--main cta-noise relative">
          <span className="relative z-0">{pending ? "Ouverture…" : "Entrer dans le donjon"}</span>
        </button>
      </div>
      <p id={errorId} role="alert" className="min-h-5 text-sm text-danger">
        {error}
      </p>
    </form>
  );
}
