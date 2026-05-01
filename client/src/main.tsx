
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ClerkProvider } from '@clerk/react'
import { Toaster } from '@/components/ui/sonner'

createRoot(document.getElementById('root')!).render(
 
    <ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY} unsafe_disableDevelopmentModeConsoleWarning>
      <App />
      <Toaster />
    </ClerkProvider>
  
)
