import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Chat from "./pages/Chat";
import Auth from "./pages/Auth";
import Landing from "./pages/Landing";
import { useUser } from "@clerk/react";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import Loading from "./features/chat/components/Loading";
import { useUserSync } from "./features/auth/hooks/useUserSync";
import { useServerStatus } from "./contexts/ServerStatusContext";
import ServerDownBanner from "./components/ui/ServerDownBanner";

function App() {
  const { isSignedIn, isLoaded } = useUser();
  const { isDown, isRetrying, retry, onClose } = useServerStatus();
  
  // Sync user with DB whenever authenticated
  useUserSync();

  if (!isLoaded)
    return (
      <Loading />
    );

  return (
    <BrowserRouter>
      <div className="relative min-h-screen transition-colors duration-300 flex flex-col">
        <ServerDownBanner 
          isDown={isDown} 
          isRetrying={isRetrying} 
          onRetry={retry} 
          onClose={onClose}
        />
        
        <div className="flex-1 overflow-hidden relative">
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
      </div>
    </BrowserRouter>
  );
}

export default App;
