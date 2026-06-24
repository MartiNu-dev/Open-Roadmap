import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CircleHelp, Plus, ShieldCheck, Trash2 } from "lucide-react";

import Navbar from "@/components/Navbar";
import { useAuth } from "@/context/AuthContext";
import api, { API_BASE, formatApiError } from "@/lib/api";
import { getRoleLabel } from "@/i18n/formatters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const ROLES = ["user", "editor", "admin"];
const ROLE_BADGE = {
  admin: "bg-slate-900 text-white",
  editor: "bg-blue-100 text-blue-700",
  user: "bg-slate-100 text-slate-700",
};
const DEFAULT_AUTH_SETTINGS = {
  self_register_enabled: true,
  oidc_enabled: false,
  editors_see_all_roadmaps: true,
  oidc_display_name: "Enterprise SSO",
  oidc_issuer_url: "",
  oidc_client_id: "",
  client_secret: "",
  oidc_scopes: "openid profile email",
  oidc_email_claim: "email",
  oidc_name_claim: "name",
  oidc_role_claim: "roles",
  oidc_role_values_user: "user",
  oidc_role_values_editor: "editor",
  oidc_role_values_admin: "admin",
  has_client_secret: false,
  secret_source: "none",
  configured: false,
  callback_url_override: null,
  callback_url_overridden: false,
};
const DEFAULT_VISIBILITY_SETTINGS = {
  editors_see_all_roadmaps: true,
  mappings: [],
};

function createVisibilityMapping() {
  return {
    id: `local-${Math.random().toString(36).slice(2, 10)}`,
    role_name: "",
    tags: "",
  };
}

function AuthToggleRow({ title, description, checked, onCheckedChange, testId }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-slate-200 bg-white p-4">
      <div>
        <div className="font-medium text-slate-900">{title}</div>
        <p className="mt-1 text-sm text-slate-600">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} data-testid={testId} />
    </div>
  );
}

export default function AdminUsersEnterprise() {
  const { user, loading, refreshAuthOptions } = useAuth();
  const { t } = useTranslation(["common", "admin"]);
  const [users, setUsers] = useState([]);
  const [usersErr, setUsersErr] = useState("");
  const [authErr, setAuthErr] = useState("");
  const [authSaved, setAuthSaved] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authSettings, setAuthSettings] = useState(DEFAULT_AUTH_SETTINGS);
  const [clearClientSecret, setClearClientSecret] = useState(false);
  const [visibilityErr, setVisibilityErr] = useState("");
  const [visibilitySaved, setVisibilitySaved] = useState("");
  const [visibilityBusy, setVisibilityBusy] = useState(false);
  const [visibilitySettings, setVisibilitySettings] = useState(DEFAULT_VISIBILITY_SETTINGS);

  const callbackUrl = authSettings.callback_url_override || `${API_BASE}/auth/oidc/callback`;

  const loadUsers = async () => {
    try {
      const { data } = await api.get("/admin/users");
      setUsers(data);
      setUsersErr("");
    } catch (e) {
      setUsersErr(formatApiError(e, t("common:errors.generic")));
    }
  };

  const loadAuthSettings = async () => {
    try {
      const { data } = await api.get("/admin/auth/settings");
      setAuthSettings({
        ...DEFAULT_AUTH_SETTINGS,
        ...data,
        client_secret: "",
      });
      setClearClientSecret(false);
      setAuthErr("");
    } catch (e) {
      setAuthErr(formatApiError(e, t("common:errors.generic")));
    }
  };

  const loadVisibilitySettings = async () => {
    try {
      const { data } = await api.get("/admin/roadmap-visibility-settings");
      setVisibilitySettings({
        ...DEFAULT_VISIBILITY_SETTINGS,
        ...data,
        mappings: (data?.mappings || []).map((entry) => ({
          id: entry.id,
          role_name: entry.role_name,
          tags: entry.tags,
        })),
      });
      setVisibilityErr("");
    } catch (e) {
      setVisibilityErr(formatApiError(e, t("common:errors.generic")));
    }
  };

  useEffect(() => {
    if (user?.role === "admin") {
      loadUsers();
      loadAuthSettings();
      loadVisibilitySettings();
    }
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

  const updateAuthField = (field, value) => {
    setAuthSettings((prev) => ({ ...prev, [field]: value }));
    if (field === "client_secret" && value) {
      setClearClientSecret(false);
    }
    setAuthSaved("");
  };

  const saveAuthSettings = async (event) => {
    event.preventDefault();
    setAuthBusy(true);
    setAuthErr("");
    setAuthSaved("");

    try {
      const payload = {
        self_register_enabled: authSettings.self_register_enabled,
        oidc_enabled: authSettings.oidc_enabled,
        oidc_display_name: authSettings.oidc_display_name,
        oidc_issuer_url: authSettings.oidc_issuer_url,
        oidc_client_id: authSettings.oidc_client_id,
        oidc_scopes: authSettings.oidc_scopes,
        oidc_email_claim: authSettings.oidc_email_claim,
        oidc_name_claim: authSettings.oidc_name_claim,
        oidc_role_claim: authSettings.oidc_role_claim,
        oidc_role_values_user: authSettings.oidc_role_values_user,
        oidc_role_values_editor: authSettings.oidc_role_values_editor,
        oidc_role_values_admin: authSettings.oidc_role_values_admin,
      };
      if (authSettings.client_secret.trim() || clearClientSecret) {
        payload.client_secret = authSettings.client_secret;
      }
      const { data } = await api.put("/admin/auth/settings", payload);
      setAuthSettings({
        ...DEFAULT_AUTH_SETTINGS,
        ...data,
        client_secret: "",
      });
      setClearClientSecret(false);
      setAuthSaved(t("admin:auth.saved"));
      await refreshAuthOptions();
    } catch (e) {
      setAuthErr(formatApiError(e, t("common:errors.generic")));
    } finally {
      setAuthBusy(false);
    }
  };

  const updateVisibilityField = (field, value) => {
    setVisibilitySettings((prev) => ({ ...prev, [field]: value }));
    setVisibilitySaved("");
  };

  const updateVisibilityMapping = (id, field, value) => {
    setVisibilitySettings((prev) => ({
      ...prev,
      mappings: prev.mappings.map((entry) => (entry.id === id ? { ...entry, [field]: value } : entry)),
    }));
    setVisibilitySaved("");
  };

  const addVisibilityMapping = () => {
    setVisibilitySettings((prev) => ({
      ...prev,
      mappings: [...prev.mappings, createVisibilityMapping()],
    }));
    setVisibilitySaved("");
  };

  const removeVisibilityMapping = (id) => {
    setVisibilitySettings((prev) => ({
      ...prev,
      mappings: prev.mappings.filter((entry) => entry.id !== id),
    }));
    setVisibilitySaved("");
  };

  const saveVisibilitySettings = async (event) => {
    event.preventDefault();
    setVisibilityBusy(true);
    setVisibilityErr("");
    setVisibilitySaved("");

    try {
      const mappings = (visibilitySettings.mappings || [])
        .filter((entry) => entry.role_name.trim() || entry.tags.trim())
        .map((entry) => ({
          role_name: entry.role_name,
          tags: entry.tags,
        }));
      const { data } = await api.put("/admin/roadmap-visibility-settings", {
        editors_see_all_roadmaps: visibilitySettings.editors_see_all_roadmaps,
        mappings,
      });
      setVisibilitySettings({
        ...DEFAULT_VISIBILITY_SETTINGS,
        ...data,
        mappings: (data?.mappings || []).map((entry) => ({
          id: entry.id,
          role_name: entry.role_name,
          tags: entry.tags,
        })),
      });
      setVisibilitySaved(t("admin:visibility.saved"));
    } catch (e) {
      setVisibilityErr(formatApiError(e, t("common:errors.generic")));
    } finally {
      setVisibilityBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <div className="max-w-5xl mx-auto px-6 py-16">
        <div className="text-xs font-mono uppercase tracking-[0.2em] text-slate-500 mb-3">{t("admin:users.eyebrow")}</div>
        <h1 className="font-display text-4xl font-bold tracking-tight text-slate-900">{t("admin:users.title")}</h1>
        <p className="mt-2 text-slate-600 text-sm">{t("admin:users.description")}</p>

        <Tabs defaultValue="users" className="mt-10">
          <TabsList className="bg-slate-100">
            <TabsTrigger value="users" data-testid="admin-tab-users">{t("admin:tabs.users")}</TabsTrigger>
            <TabsTrigger value="auth" data-testid="admin-tab-auth">{t("admin:tabs.authentication")}</TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="mt-6">
            {usersErr && <div className="mb-4 text-sm text-red-600">{usersErr}</div>}

            <div className="border border-slate-200 rounded-lg overflow-hidden" data-testid="admin-users-table">
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
          </TabsContent>

          <TabsContent value="auth" className="mt-6">
            <form onSubmit={saveAuthSettings} className="space-y-6" data-testid="admin-auth-settings-form">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-white">
                    <ShieldCheck size={18} />
                  </div>
                  <div>
                    <h2 className="font-display text-xl font-semibold text-slate-900">{t("admin:auth.title")}</h2>
                    <p className="mt-1 text-sm text-slate-600">{t("admin:auth.description")}</p>
                  </div>
                </div>
              </div>

              {(authErr || authSaved) && (
                <div className={`text-sm ${authErr ? "text-red-600" : "text-green-700"}`}>
                  {authErr || authSaved}
                </div>
              )}

              <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
                <div>
                  <h3 className="font-display text-lg font-semibold text-slate-900">{t("admin:auth.methods.title")}</h3>
                  <p className="mt-1 text-sm text-slate-600">{t("admin:auth.methods.description")}</p>
                </div>

                <AuthToggleRow
                  title={t("admin:auth.methods.oidcTitle")}
                  description={t("admin:auth.methods.oidcDescription")}
                  checked={authSettings.oidc_enabled}
                  onCheckedChange={(checked) => updateAuthField("oidc_enabled", checked)}
                  testId="admin-auth-oidc-enabled"
                />
                <AuthToggleRow
                  title={t("admin:auth.methods.selfRegisterTitle")}
                  description={t("admin:auth.methods.selfRegisterDescription")}
                  checked={authSettings.self_register_enabled}
                  onCheckedChange={(checked) => updateAuthField("self_register_enabled", checked)}
                  testId="admin-auth-self-register-enabled"
                />
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-display text-lg font-semibold text-slate-900">{t("admin:auth.oidc.title")}</h3>
                    <p className="mt-1 text-sm text-slate-600">{t("admin:auth.oidc.description")}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${authSettings.configured ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"}`}>
                    {authSettings.configured ? t("admin:auth.oidc.configured") : t("admin:auth.oidc.incomplete")}
                  </span>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="oidc-display-name">{t("admin:auth.fields.displayName")}</Label>
                    <Input id="oidc-display-name" value={authSettings.oidc_display_name} onChange={(e) => updateAuthField("oidc_display_name", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="oidc-scopes">{t("admin:auth.fields.scopes")}</Label>
                    <Input id="oidc-scopes" value={authSettings.oidc_scopes} onChange={(e) => updateAuthField("oidc_scopes", e.target.value)} />
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <Label htmlFor="oidc-issuer-url">{t("admin:auth.fields.issuerUrl")}</Label>
                    <Input id="oidc-issuer-url" value={authSettings.oidc_issuer_url} onChange={(e) => updateAuthField("oidc_issuer_url", e.target.value)} placeholder="https://issuer.example.com" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="oidc-client-id">{t("admin:auth.fields.clientId")}</Label>
                    <Input id="oidc-client-id" value={authSettings.oidc_client_id} onChange={(e) => updateAuthField("oidc_client_id", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="oidc-client-secret">{t("admin:auth.fields.clientSecret")}</Label>
                    <Input id="oidc-client-secret" type="password" value={authSettings.client_secret} onChange={(e) => updateAuthField("client_secret", e.target.value)} placeholder={authSettings.has_client_secret ? t("admin:auth.fields.clientSecretSaved") : ""} />
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs text-slate-500">{t(`admin:auth.secretSource.${authSettings.secret_source}`)}</p>
                      {authSettings.has_client_secret && (
                        <button
                          type="button"
                          className="text-xs font-medium text-slate-700 underline"
                          onClick={() => {
                            setClearClientSecret(true);
                            updateAuthField("client_secret", "");
                          }}
                        >
                          {t("admin:auth.clearSecret")}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="oidc-email-claim">{t("admin:auth.fields.emailClaim")}</Label>
                    <Input id="oidc-email-claim" value={authSettings.oidc_email_claim} onChange={(e) => updateAuthField("oidc_email_claim", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="oidc-name-claim">{t("admin:auth.fields.nameClaim")}</Label>
                    <Input id="oidc-name-claim" value={authSettings.oidc_name_claim} onChange={(e) => updateAuthField("oidc_name_claim", e.target.value)} />
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <Label htmlFor="oidc-role-claim">{t("admin:auth.fields.roleClaim")}</Label>
                    <Input id="oidc-role-claim" value={authSettings.oidc_role_claim} onChange={(e) => updateAuthField("oidc_role_claim", e.target.value)} />
                  </div>
                </div>

                <div className="grid gap-5 md:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="oidc-role-values-user">{t("admin:auth.fields.roleValuesUser")}</Label>
                    <Input id="oidc-role-values-user" value={authSettings.oidc_role_values_user} onChange={(e) => updateAuthField("oidc_role_values_user", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="oidc-role-values-editor">{t("admin:auth.fields.roleValuesEditor")}</Label>
                    <Input id="oidc-role-values-editor" value={authSettings.oidc_role_values_editor} onChange={(e) => updateAuthField("oidc_role_values_editor", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="oidc-role-values-admin">{t("admin:auth.fields.roleValuesAdmin")}</Label>
                    <Input id="oidc-role-values-admin" value={authSettings.oidc_role_values_admin} onChange={(e) => updateAuthField("oidc_role_values_admin", e.target.value)} />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="oidc-callback-url">{t("admin:auth.fields.callbackUrl")}</Label>
                    {authSettings.callback_url_overridden && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-700">
                        {t("admin:auth.callbackOverride.badge")}
                      </span>
                    )}
                  </div>
                  <Input id="oidc-callback-url" readOnly value={callbackUrl} className="font-mono text-xs" />
                  {authSettings.callback_url_overridden && (
                    <p className="text-xs text-slate-500">{t("admin:auth.callbackOverride.description")}</p>
                  )}
                </div>
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={authBusy} data-testid="admin-auth-save-btn">
                  {authBusy ? t("admin:auth.saving") : t("admin:auth.save")}
                </Button>
              </div>
            </form>

            <form onSubmit={saveVisibilitySettings} className="mt-8 space-y-6" data-testid="admin-visibility-settings-form">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="font-display text-lg font-semibold text-slate-900">{t("admin:visibility.title")}</h3>
                    <p className="mt-1 text-sm text-slate-600">{t("admin:visibility.description")}</p>
                  </div>
                  <div className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-700">
                    {t("admin:visibility.specialTagBadge")}
                  </div>
                </div>

                {(visibilityErr || visibilitySaved) && (
                  <div className={`text-sm ${visibilityErr ? "text-red-600" : "text-green-700"}`}>
                    {visibilityErr || visibilitySaved}
                  </div>
                )}

                <div className="flex items-start justify-between gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="max-w-3xl">
                    <div className="flex items-center gap-2 font-medium text-slate-900">
                      <span>{t("admin:visibility.editorsSeeAll.title")}</span>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button type="button" className="text-slate-500 hover:text-slate-900" data-testid="admin-visibility-help">
                              <CircleHelp size={14} />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            {t("admin:visibility.editorsSeeAll.help")}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{t("admin:visibility.editorsSeeAll.description")}</p>
                  </div>
                  <Switch
                    checked={visibilitySettings.editors_see_all_roadmaps}
                    onCheckedChange={(checked) => updateVisibilityField("editors_see_all_roadmaps", checked)}
                    data-testid="admin-visibility-editors-see-all"
                  />
                </div>

                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                  {t("admin:visibility.publicTagHint")}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h4 className="font-medium text-slate-900">{t("admin:visibility.mappingsTitle")}</h4>
                      <p className="mt-1 text-sm text-slate-600">{t("admin:visibility.mappingsDescription")}</p>
                    </div>
                    <Button type="button" variant="outline" onClick={addVisibilityMapping} data-testid="admin-visibility-add">
                      <Plus size={14} className="mr-1" /> {t("admin:visibility.addMapping")}
                    </Button>
                  </div>

                  {visibilitySettings.mappings.length === 0 ? (
                    <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500" data-testid="admin-visibility-empty">
                      {t("admin:visibility.empty")}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {visibilitySettings.mappings.map((entry, index) => (
                        <div key={entry.id} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]">
                          <div className="space-y-1.5">
                            <Label htmlFor={`visibility-role-${entry.id}`}>{t("admin:visibility.fields.roleName")}</Label>
                            <Input
                              id={`visibility-role-${entry.id}`}
                              value={entry.role_name}
                              onChange={(e) => updateVisibilityMapping(entry.id, "role_name", e.target.value)}
                              placeholder={t("admin:visibility.fields.roleNamePlaceholder")}
                              data-testid={`admin-visibility-role-${index}`}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor={`visibility-tags-${entry.id}`}>{t("admin:visibility.fields.tags")}</Label>
                            <Input
                              id={`visibility-tags-${entry.id}`}
                              value={entry.tags}
                              onChange={(e) => updateVisibilityMapping(entry.id, "tags", e.target.value.toLowerCase())}
                              placeholder={t("admin:visibility.fields.tagsPlaceholder")}
                              data-testid={`admin-visibility-tags-${index}`}
                            />
                          </div>
                          <div className="flex items-end">
                            <Button type="button" variant="outline" onClick={() => removeVisibilityMapping(entry.id)} data-testid={`admin-visibility-remove-${index}`}>
                              <Trash2 size={14} className="text-red-600" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex justify-end">
                  <Button type="submit" disabled={visibilityBusy} data-testid="admin-visibility-save-btn">
                    {visibilityBusy ? t("admin:visibility.saving") : t("admin:visibility.save")}
                  </Button>
                </div>
              </div>
            </form>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
