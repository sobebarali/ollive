import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { Logo } from "@/components/logo";
import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";

export const Route = createFileRoute("/login")({
  component: RouteComponent,
});

const LOGIN_IMAGE = "https://picsum.photos/seed/ollive-branch/1000/1400";

function RouteComponent() {
  const [showSignIn, setShowSignIn] = useState(false);

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="relative hidden overflow-hidden lg:block">
        <img
          alt="Olive branch"
          className="absolute inset-0 h-full w-full object-cover"
          height={1400}
          src={LOGIN_IMAGE}
          width={1000}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-primary/80 via-primary/40 to-primary/20 mix-blend-multiply" />
        <div className="relative flex h-full flex-col justify-between p-10 text-primary-foreground">
          <Link className="w-fit" to="/">
            <Logo className="[&_span]:text-primary-foreground" />
          </Link>
          <div className="max-w-md">
            <p className="text-balance font-medium text-2xl leading-snug">
              “Every model call, captured, redacted, and measured — without
              slowing the chat down.”
            </p>
            <p className="mt-3 text-primary-foreground/80 text-sm">
              Ollive inference logging
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Link to="/">
              <Logo />
            </Link>
          </div>
          {showSignIn ? (
            <SignInForm onSwitchToSignUp={() => setShowSignIn(false)} />
          ) : (
            <SignUpForm onSwitchToSignIn={() => setShowSignIn(true)} />
          )}
        </div>
      </div>
    </div>
  );
}
