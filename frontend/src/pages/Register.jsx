import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Register() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { register } = useAuth();
  const { t } = useTranslation("auth");
  const navigate = useNavigate();

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    const res = await register(email, name, password);
    setBusy(false);
    if (res.ok) navigate("/dashboard");
    else setError(res.error);
  };

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <div className="max-w-md mx-auto px-6 py-20">
        <div className="text-xs font-mono uppercase tracking-[0.2em] text-slate-500 mb-3">{t("register.eyebrow")}</div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900">{t("register.title")}</h1>
        <p className="mt-2 text-slate-600 text-sm">{t("register.subtitle")}</p>

        <form onSubmit={onSubmit} className="mt-8 space-y-5" data-testid="register-form">
          <div className="space-y-1.5">
            <Label htmlFor="name">{t("register.name")}</Label>
            <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} data-testid="register-name-input" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">{t("register.email")}</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} data-testid="register-email-input" autoComplete="email" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">{t("register.password")}</Label>
            <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} data-testid="register-password-input" autoComplete="new-password" />
            <p className="text-xs text-slate-500">{t("register.passwordHint")}</p>
          </div>
          {error && <div className="text-sm text-red-600" data-testid="register-error">{error}</div>}
          <Button type="submit" className="w-full" disabled={busy} data-testid="register-submit-btn">
            {busy ? t("register.creating") : t("register.createAccount")}
          </Button>
        </form>

        <p className="mt-6 text-sm text-slate-600">
          {t("register.alreadyHaveAccount")} <Link to="/login" className="underline font-medium text-slate-900">{t("register.logIn")}</Link>
        </p>
      </div>
    </div>
  );
}
