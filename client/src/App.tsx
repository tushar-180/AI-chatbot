import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Chat from "./pages/Chat";
import Auth from "./pages/Auth";
import Landing from "./pages/Landing";
import { useUser } from "@clerk/react";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import Loading from "./features/chat/components/Loading";
import { useUserSync } from "./features/auth/hooks/useUserSync";

function App() {
  const { isSignedIn, isLoaded } = useUser();
  
  // Sync user with DB whenever authenticated
  useUserSync();

  if (!isLoaded)
    return (
      <Loading />
    );

  return (
    <BrowserRouter>
      <div className="min-h-screen transition-colors duration-300">
        <Routes>
          {/* Public Landing Page */}
          <Route
            path="/"
            element={!isSignedIn ? <Landing /> : <Navigate to="/chat" replace />}
          />

          {/* Protected Chat Route */}
          <Route
            path="/chat"
            element={
              <ProtectedRoute>
                <Chat />
              </ProtectedRoute>
            }
          />

          {/* Public Auth Route */}
          <Route
            path="/auth"
            element={!isSignedIn ? <Auth /> : <Navigate to="/chat" replace />}
          />

          {/* Catch all - redirect to landing */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
