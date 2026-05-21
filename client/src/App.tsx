import { Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useUser } from "@clerk/react";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import Loading from "./features/chat/components/Loading";
import { useAuthSetup } from "./features/auth/hooks/useUserSync";
import { useServerStatus } from "./contexts/ServerStatusContext";
import ServerDownBanner from "./components/ui/ServerDownBanner";

import Landing from "./pages/Landing";
import Chat from "./pages/Chat";
import Auth from "./pages/Auth";
import SharedChatPage from "./pages/SharedChatPage";
import Admin from "./pages/Admin";
import GroupChat from "./pages/GroupChat";
import JoinGroupPage from "./pages/JoinGroupPage";
import ChatLayout from "./features/chat/components/ChatLayout";
import ProjectsDashboardPage from "./pages/ProjectsDashboardPage";

function App() {
  const { isSignedIn, isLoaded } = useUser();
  const { isDown, isRetrying, retry } = useServerStatus();

  useEffect(() => {
    const handleCopy = (event: ClipboardEvent) => {
      // If the user is currently focused on an input or textarea, let the default copy behavior run
      const activeElement = document.activeElement;
      if (
        activeElement &&
        (activeElement.tagName === "INPUT" || activeElement.tagName === "TEXTAREA")
      ) {
        return;
      }

      const selection = document.getSelection();
      if (!selection || selection.rangeCount === 0) return;

      try {
        const range = selection.getRangeAt(0);
        const clonedSelection = range.cloneContents();

        // Modify the cloned selection to remove .not-selectable elements (e.g. actions/icons)
        const notSelectableElements = clonedSelection.querySelectorAll('.not-selectable');
        notSelectableElements.forEach(element => element.remove());

        // Create a temporary container to extract text
        const tempDiv = document.createElement('div');
        tempDiv.appendChild(clonedSelection);

        // Set the modified content to the clipboard
        if (event.clipboardData) {
          event.clipboardData.setData('text/plain', tempDiv.textContent || "");
          event.preventDefault(); // Prevent default copy action
        }
      } catch (err) {
        console.error("Custom copy helper failed:", err);
      }
    };

    document.addEventListener('copy', handleCopy);
    return () => {
      document.removeEventListener('copy', handleCopy);
    };
  }, []);

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

              {/* Persistent Chat Layout */}
              <Route element={<ChatLayout />}>
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

                <Route
                  path="/projects"
                  element={
                    <ProtectedRoute>
                      <ProjectsDashboardPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/projects/:projectId"
                  element={
                    <ProtectedRoute>
                      <ProjectsDashboardPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/projects/:projectId/new"
                  element={
                    <ProtectedRoute>
                      <Chat />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/projects/:projectId/chat/:chatId"
                  element={
                    <ProtectedRoute>
                      <Chat />
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
              </Route>

              {/* Protected Admin Route */}
              <Route
                path="/admin"
                element={
                  <ProtectedRoute>
                    <Admin />
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
