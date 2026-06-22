import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import api, { formatApiError } from "@/lib/api";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/context/AuthContext";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { getRoleLabel } from "@/i18n/formatters";
import { Trash2 } from "lucide-react";

const ROLES = ["user", "editor", "admin"];
const ROLE_BADGE = {
  admin: "bg-slate-900 text-white",
  editor: "bg-blue-100 text-blue-700",
  user: "bg-slate-100 text-slate-700",
};

export default function AdminUsers() {
  const { user, loading } = useAuth();
  const { t } = useTranslation(["common", "admin"]);
  const [users, setUsers] = useState([]);
  const [err, setErr] = useState("");

  const load = async () => {
    try {
      const { data } = await api.get("/admin/users");
      setUsers(data);
    } catch (e) {
      setErr(formatApiError(e, t("common:errors.generic")));
    }
  };

  useEffect(() => {
    if (user?.role === "admin") load();
  }, [user?.id]);

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "admin") return <Navigate to="/" replace />;

  const setRole = async (id, role) => {
    try {
      const { data } = await api.patch(`/admin/users/${id}/role`, { role });
      setUsers((prev) => prev.map((entry) => (entry.id === id ? data : entry)));
    } catch (e) {
      alert(formatApiError(e, t("common:errors.generic")));
    }
  };

  const del = async (id, email) => {
    if (!window.confirm(t("admin:users.deleteConfirm", { email }))) return;
    try {
      await api.delete(`/admin/users/${id}`);
      setUsers((prev) => prev.filter((entry) => entry.id !== id));
    } catch (e) {
      alert(formatApiError(e, t("common:errors.generic")));
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <div className="max-w-5xl mx-auto px-6 py-16">
        <div className="text-xs font-mono uppercase tracking-[0.2em] text-slate-500 mb-3">{t("admin:users.eyebrow")}</div>
        <h1 className="font-display text-4xl font-bold tracking-tight text-slate-900">{t("admin:users.title")}</h1>
        <p className="mt-2 text-slate-600 text-sm">{t("admin:users.description")}</p>

        {err && <div className="mt-4 text-sm text-red-600">{err}</div>}

        <div className="mt-10 border border-slate-200 rounded-lg overflow-hidden" data-testid="admin-users-table">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-left">
              <tr>
                <th className="px-4 py-3 font-display font-semibold text-slate-700">{t("admin:users.name")}</th>
                <th className="px-4 py-3 font-display font-semibold text-slate-700">{t("admin:users.email")}</th>
                <th className="px-4 py-3 font-display font-semibold text-slate-700">{t("admin:users.role")}</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((entry) => (
                <tr key={entry.id} className="border-b border-slate-100 last:border-0" data-testid={`admin-user-row-${entry.email}`}>
                  <td className="px-4 py-3 font-medium text-slate-900">{entry.name}</td>
                  <td className="px-4 py-3 text-slate-600 font-mono text-xs">{entry.email}</td>
                  <td className="px-4 py-3">
                    <select
                      value={entry.role}
                      onChange={(e) => setRole(entry.id, e.target.value)}
                      disabled={entry.id === user.id}
                      className={`text-xs uppercase tracking-wider font-semibold rounded px-2 py-1 border border-transparent ${ROLE_BADGE[entry.role]}`}
                      data-testid={`admin-role-select-${entry.email}`}
                    >
                      {ROLES.map((role) => <option key={role} value={role}>{getRoleLabel(t, role)}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="outline" onClick={() => del(entry.id, entry.email)} disabled={entry.id === user.id} data-testid={`admin-delete-btn-${entry.email}`}>
                      <Trash2 size={14} className="text-red-600" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
