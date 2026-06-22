import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { login } = useAuth();
  const { t } = useTranslation("auth");
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = location.state?.from || "/dashboard";

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    const res = await login(email, password);
    setBusy(false);
    if (res.ok) navigate(redirectTo);
    else setError(res.error);
  };

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <div className="max-w-md mx-auto px-6 py-20">
        <div className="text-xs font-mono uppercase tracking-[0.2em] text-slate-500 mb-3">{t("login.eyebrow")}</div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900">{t("login.title")}</h1>
        <p className="mt-2 text-slate-600 text-sm">
          {t("login.demoAccounts")} <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded">user@example.com / user123</code>
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-5" data-testid="login-form">
          <div className="space-y-1.5">
            <Label htmlFor="email">{t("login.email")}</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} data-testid="login-email-input" autoComplete="email" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">{t("login.password")}</Label>
            <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} data-testid="login-password-input" autoComplete="current-password" />
          </div>
          {error && <div className="text-sm text-red-600" data-testid="login-error">{error}</div>}
          <Button type="submit" className="w-full" disabled={busy} data-testid="login-submit-btn">
            {busy ? t("login.signingIn") : t("login.signIn")}
          </Button>
        </form>

        <p className="mt-6 text-sm text-slate-600">
          {t("login.noAccount")} <Link to="/register" className="underline font-medium text-slate-900">{t("login.createOne")}</Link>
        </p>
      </div>
    </div>
  );
}
