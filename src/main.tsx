import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ClerkProvider, useAuth } from '@clerk/clerk-react'
import { ConvexReactClient } from 'convex/react'
import { ConvexProviderWithClerk } from 'convex/react-clerk'

const CONVEX_URL = import.meta.env.VITE_CONVEX_URL
const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

// Initialize Convex client when configured
const convex = CONVEX_URL ? new ConvexReactClient(CONVEX_URL) : null

function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexProviderWithClerk client={convex!} useAuth={useAuth}>
      {children}
    </ConvexProviderWithClerk>
  )
}

const root = createRoot(document.getElementById('root')!)

if (!CLERK_PUBLISHABLE_KEY || !CONVEX_URL) {
  // Render a friendly configuration screen instead of throwing
  root.render(
    <StrictMode>
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 12,
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
      }}>
        <h1 style={{ margin: 0 }}>Configuration required</h1>
        {!CLERK_PUBLISHABLE_KEY && (
          <div>Missing env: <code>VITE_CLERK_PUBLISHABLE_KEY</code></div>
        )}
        {!CONVEX_URL && (
          <div>Missing env: <code>VITE_CONVEX_URL</code></div>
        )}
        <p style={{ color: '#555' }}>Create a <code>.env.local</code> and restart the dev server.</p>
      </div>
    </StrictMode>
  )
} else {
  root.render(
    <StrictMode>
      <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
        <ConvexClientProvider>
          <App />
        </ConvexClientProvider>
      </ClerkProvider>
    </StrictMode>
  )
}
