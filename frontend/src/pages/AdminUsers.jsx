import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/context/AuthContext";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

const ROLES = ["user", "editor", "admin"];
const ROLE_BADGE = {
  admin: "bg-slate-900 text-white",
  editor: "bg-blue-100 text-blue-700",
  user: "bg-slate-100 text-slate-700",
};

export default function AdminUsers() {
  const { user, loading } = useAuth();
  const [users, setUsers] = useState([]);
  const [err, setErr] = useState("");

  const load = async () => {
    try {
      const { data } = await api.get("/admin/users");
      setUsers(data);
    } catch (e) { setErr(formatApiError(e)); }
  };

  useEffect(() => { if (user?.role === "admin") load(); }, [user?.id]);

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "admin") return <Navigate to="/" replace />;

  const setRole = async (id, role) => {
    try {
      const { data } = await api.patch(`/admin/users/${id}/role`, { role });
      setUsers((prev) => prev.map((u) => (u.id === id ? data : u)));
    } catch (e) { alert(formatApiError(e)); }
  };

  const del = async (id, email) => {
    if (!window.confirm(`Delete user "${email}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/admin/users/${id}`);
      setUsers((prev) => prev.filter((u) => u.id !== id));
    } catch (e) { alert(formatApiError(e)); }
  };

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <div className="max-w-5xl mx-auto px-6 py-16">
        <div className="text-xs font-mono uppercase tracking-[0.2em] text-slate-500 mb-3">// Admin</div>
        <h1 className="font-display text-4xl font-bold tracking-tight text-slate-900">User management</h1>
        <p className="mt-2 text-slate-600 text-sm">Promote users to editors/admins or remove inactive accounts.</p>

        {err && <div className="mt-4 text-sm text-red-600">{err}</div>}

        <div className="mt-10 border border-slate-200 rounded-lg overflow-hidden" data-testid="admin-users-table">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-left">
              <tr>
                <th className="px-4 py-3 font-display font-semibold text-slate-700">Name</th>
                <th className="px-4 py-3 font-display font-semibold text-slate-700">Email</th>
                <th className="px-4 py-3 font-display font-semibold text-slate-700">Role</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-slate-100 last:border-0" data-testid={`admin-user-row-${u.email}`}>
                  <td className="px-4 py-3 font-medium text-slate-900">{u.name}</td>
                  <td className="px-4 py-3 text-slate-600 font-mono text-xs">{u.email}</td>
                  <td className="px-4 py-3">
                    <select
                      value={u.role}
                      onChange={(e) => setRole(u.id, e.target.value)}
                      disabled={u.id === user.id}
                      className={`text-xs uppercase tracking-wider font-semibold rounded px-2 py-1 border border-transparent ${ROLE_BADGE[u.role]}`}
                      data-testid={`admin-role-select-${u.email}`}
                    >
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="outline" onClick={() => del(u.id, u.email)} disabled={u.id === user.id} data-testid={`admin-delete-btn-${u.email}`}>
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
