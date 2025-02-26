import { createAuthClient } from 'better-auth/vue' // make sure to import from better-auth/vue

export const authClient = createAuthClient({
  baseURL: 'http://localhost:3000/api/auth',
  // You can pass client configuratiok here if needed
})
