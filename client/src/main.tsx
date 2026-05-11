
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ClerkProvider } from '@clerk/react'
import { Toaster } from '@/components/ui/sonner'
import { ServerStatusProvider } from './contexts/ServerStatusContext'

createRoot(document.getElementById('root')!).render(
 
    <ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY} unsafe_disableDevelopmentModeConsoleWarning>
    
      <ServerStatusProvider>
        <App />
      <Toaster position="top-right" richColors />
      </ServerStatusProvider>
    </ClerkProvider>
  
)
