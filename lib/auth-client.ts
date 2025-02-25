import { createAuthClient } from 'better-auth/vue' // make sure to import from better-auth/vue

export const authClient = createAuthClient({
  // You can pass client configuration here if needed
})

// Export the entire client for direct access to all methods
export default authClient

// Export specific methods for easier imports
export const {
  signIn,
  signUp,
  signOut,
  useSession,
} = authClient
