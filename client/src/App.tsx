import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useUser } from "@clerk/react";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import Loading from "./features/chat/components/Loading";
import { useAuthSetup } from "./features/auth/hooks/useUserSync";
import { useServerStatus } from "./contexts/ServerStatusContext";
import ServerDownBanner from "./components/ui/ServerDownBanner";

const Landing = lazy(() => import("./pages/Landing"));
const Chat = lazy(() => import("./pages/Chat"));
const Auth = lazy(() => import("./pages/Auth"));
const SharedChatPage = lazy(() => import("./pages/SharedChatPage"));
const Admin = lazy(() => import("./pages/Admin"));
const GroupChat = lazy(() => import("./pages/GroupChat"));
const JoinGroupPage = lazy(() => import("./pages/JoinGroupPage"));
function App() {
  const { isSignedIn, isLoaded } = useUser();
  const { isDown, isRetrying, retry } = useServerStatus();
  
  // Wire Clerk JWT into the axios instance
  useAuthSetup();

  if (!isLoaded) return <Loading />;

  return (
    <BrowserRouter>
      <div className="relative min-h-screen transition-colors duration-300 flex flex-col">
        <ServerDownBanner
          isDown={isDown}
          isRetrying={isRetrying}
          onRetry={retry}
        />

        <div className="flex-1 overflow-hidden relative">
          <Suspense fallback={<Loading />}>
            <Routes>
              {/* Public Landing Page */}
              <Route
                path="/"
                element={
                  !isSignedIn ? <Landing /> : <Navigate to="/chat" replace />
                }
              />

              {/* Protected Chat Routes */}
              <Route
                path="/chat"
                element={
                  <ProtectedRoute>
                    <Chat />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/chat/:chatId"
                element={
                  <ProtectedRoute>
                    <Chat />
                  </ProtectedRoute>
                }
              />

              {/* Protected Admin Route */}
              <Route
                path="/admin"
                element={
                  <ProtectedRoute>
                    <Admin />
                  </ProtectedRoute>
                }
              />

              {/* Public Shared Chat Route */}
              <Route
                path="/shared/:sharedChatId"
                element={<SharedChatPage />}
              />

              {/* Group Chat Routes */}
              <Route
                path="/group/:groupId"
                element={
                  <ProtectedRoute>
                    <GroupChat />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/join/:inviteCode"
                element={
                  <ProtectedRoute>
                    <JoinGroupPage />
                  </ProtectedRoute>
                }
              />

              {/* Public Auth Route */}
              <Route
                path="/auth"
                element={
                  !isSignedIn ? <Auth /> : <Navigate to="/chat" replace />
                }
              />
              
              {/* Catch all - redirect to landing */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </div>
      </div>
    </BrowserRouter>
  );
}

export default App;
