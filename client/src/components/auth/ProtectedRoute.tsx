import { useUser } from "@clerk/react";
import { Navigate } from "react-router-dom";

type Props = {
  children: React.ReactNode;
};

const ProtectedRoute = ({ children }: Props) => {
  const { isSignedIn, isLoaded } = useUser();

  // wait until clerk loads
  if (!isLoaded) return <div>Loading...</div>;

  // if not logged in → redirect
  if (!isSignedIn) {
    return <Navigate to="/auth" replace />;
  }

  // if logged in → show content
  return <>{children}</>;
};

export default ProtectedRoute;
