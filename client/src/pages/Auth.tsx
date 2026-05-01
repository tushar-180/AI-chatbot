import { SignIn } from "@clerk/react";

const Auth = () => {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-10">
      <div className="mx-auto max-w-md rounded-4xl border border-slate-800 bg-slate-900/95 p-8 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.9)]">
        <div className="mb-6 space-y-2 text-center">
          <p className="text-sm uppercase tracking-[0.28em] text-slate-500">
            Secure access
          </p>
          <h1 className="text-3xl font-semibold text-white">
            Sign in to continue
          </h1>
          <p className="text-sm text-slate-400">
            Use your account to access the chat assistant and keep your
            conversations private.
          </p>
        </div>
        <SignIn />
      </div>
    </div>
  );
};

export default Auth;
