import "@/index.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { Toaster } from "@/components/ui/sonner";

import Home from "@/pages/Home";
import RoadmapList from "@/pages/RoadmapList";
import RoadmapDetail from "@/pages/RoadmapDetail";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Dashboard from "@/pages/Dashboard";
import AdminUsers from "@/pages/AdminUsers";
import AdminRoadmaps from "@/pages/AdminRoadmaps";
import ProtectedRoute from "@/components/ProtectedRoute";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/roadmaps" element={<RoadmapList />} />
          <Route path="/roadmaps/:slug" element={<RoadmapDetail />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/dashboard" element={
            <ProtectedRoute><Dashboard /></ProtectedRoute>
          } />
          <Route path="/admin/users" element={
            <ProtectedRoute><AdminUsers /></ProtectedRoute>
          } />
          <Route path="/admin/roadmaps" element={
            <ProtectedRoute><AdminRoadmaps /></ProtectedRoute>
          } />
        </Routes>
      </BrowserRouter>
      <Toaster />
    </AuthProvider>
  );
}
