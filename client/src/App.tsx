import { useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import HomePage from "./pages/HomePage";
import LoginPage, { isAuthenticated } from "./pages/LoginPage";
import TripPage from "./pages/TripPage";

export default function App() {
  const [authenticated, setAuthenticated] = useState(isAuthenticated);
  if (!authenticated) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage onLogin={() => setAuthenticated(true)} />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/trip/:tripId" element={<TripPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
