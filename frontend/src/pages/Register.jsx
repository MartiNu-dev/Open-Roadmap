import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
        <div className="text-xs font-mono uppercase tracking-[0.2em] text-slate-500 mb-3">// Get started</div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900">Create your account</h1>
        <p className="mt-2 text-slate-600 text-sm">Free forever — track your progress across every roadmap.</p>

        <form onSubmit={onSubmit} className="mt-8 space-y-5" data-testid="register-form">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} data-testid="register-name-input" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} data-testid="register-email-input" autoComplete="email" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} data-testid="register-password-input" autoComplete="new-password" />
            <p className="text-xs text-slate-500">Minimum 6 characters.</p>
          </div>
          {error && <div className="text-sm text-red-600" data-testid="register-error">{error}</div>}
          <Button type="submit" className="w-full" disabled={busy} data-testid="register-submit-btn">
            {busy ? "Creating…" : "Create account"}
          </Button>
        </form>

        <p className="mt-6 text-sm text-slate-600">
          Already have an account? <Link to="/login" className="underline font-medium text-slate-900">Log in</Link>
        </p>
      </div>
    </div>
  );
}
