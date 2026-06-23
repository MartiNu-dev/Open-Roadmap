import { Link, NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { getRoleLabel } from "@/i18n/formatters";
import { Map, LogOut, User as UserIcon } from "lucide-react";

export default function Navbar() {
  const { user, logout, authOptions } = useAuth();
  const { t } = useTranslation("common");

  return (
    <header className="border-b border-slate-200 bg-white sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2" data-testid="nav-logo">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-md bg-slate-900 text-white">
            <Map size={16} />
          </span>
          <span className="font-display text-lg font-semibold tracking-tight">{t("appName")}</span>
        </Link>

        <nav className="hidden md:flex items-center gap-6 text-sm">
          <NavLink
            to="/roadmaps"
            data-testid="nav-roadmaps"
            className={({ isActive }) =>
              `transition-colors hover:text-slate-900 ${isActive ? "text-slate-900 font-medium" : "text-slate-500"}`
            }
          >
            {t("nav.roadmaps")}
          </NavLink>
          {user && (
            <NavLink
              to="/dashboard"
              data-testid="nav-dashboard"
              className={({ isActive }) =>
                `transition-colors hover:text-slate-900 ${isActive ? "text-slate-900 font-medium" : "text-slate-500"}`
              }
            >
              {t("nav.dashboard")}
            </NavLink>
          )}
          {user && (user.role === "admin" || user.role === "editor") && (
            <NavLink
              to="/admin/roadmaps"
              data-testid="nav-admin-roadmaps"
              className={({ isActive }) =>
                `transition-colors hover:text-slate-900 ${isActive ? "text-slate-900 font-medium" : "text-slate-500"}`
              }
            >
              {t("nav.manageRoadmaps")}
            </NavLink>
          )}
          {user && user.role === "admin" && (
            <NavLink
              to="/admin/users"
              data-testid="nav-admin-users"
              className={({ isActive }) =>
                `transition-colors hover:text-slate-900 ${isActive ? "text-slate-900 font-medium" : "text-slate-500"}`
              }
            >
              {t("nav.users")}
            </NavLink>
          )}
        </nav>

        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          {user ? (
            <>
              <div className="hidden sm:flex items-center gap-2 text-sm text-slate-600">
                <UserIcon size={14} />
                <span data-testid="nav-user-email">{user.email}</span>
                <span className="text-xs uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                  {getRoleLabel(t, user.role)}
                </span>
              </div>
              <Button variant="outline" size="sm" onClick={logout} data-testid="nav-logout-btn">
                <LogOut size={14} className="mr-1" /> {t("nav.logout")}
              </Button>
            </>
          ) : (
            <>
              <Link to="/login">
                <Button variant="ghost" size="sm" data-testid="nav-login-btn">{t("nav.login")}</Button>
              </Link>
              {authOptions.self_register_enabled && (
                <Link to="/register">
                  <Button size="sm" data-testid="nav-register-btn">{t("nav.getStarted")}</Button>
                </Link>
              )}
            </>
          )}
        </div>
      </div>
    </header>
  );
}
