import { login } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next = "/art-library", error } = await searchParams;

  return (
    <main className="min-h-screen flex items-center justify-center bg-bg px-6">
      <div className="w-full max-w-sm">
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-text mb-8">
          TBR Art Board
        </h1>

        <form action={login} className="flex flex-col gap-3">
          <input type="hidden" name="next" value={next} />
          <input
            type="password"
            name="password"
            placeholder="Password"
            autoFocus
            required
            className="bg-surface border border-border text-text px-4 py-3 rounded-none outline-none focus:border-accent transition-colors"
          />
          <button
            type="submit"
            className="bg-accent text-bg px-4 py-3 font-medium hover:opacity-90 transition-opacity"
          >
            Enter
          </button>
          {error && <p className="text-sm text-red-400 mt-1">Incorrect password.</p>}
        </form>
      </div>
    </main>
  );
}
